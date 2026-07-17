import { Asistencia } from '../../domain/entities/Asistencia.js';
import { AsistenciaRepositoryPort } from '../../domain/ports/AsistenciaRepositoryPort.js';
import {
  SECUENCIA_MARCACIONES,
  resolveProximaMarcacion,
  resolveTipoRegistro,
  getOpcionesMarcacion,
  calcularHorasExtrasDesdeConfig,
  redondearAMediaHora,
  puedeRegistrarMarcacion,
} from '../../domain/marcacionLogic.js';
import { prisma } from '../../../../config/prismaClient.js';
import { notifyHorasExtrasPendiente } from '../../../../shared/services/horasExtrasNotificationService.js';
import { getHorarioDelDia } from '../../infrastructure/adapters/persistence/horarioLaboralStore.js';

export { SECUENCIA_MARCACIONES };

const VALOR_HORA_EXTRA_DEFAULT    = 2.5;
const VALOR_MEDIA_HORA_EXTRA_DEFAULT = 1.5;

// ── Helper: quincena period for a UTC Date ──────────────────────────────────
function getQuincenaPeriod(date: Date): { fechaInicio: string; fechaFin: string } {
  const ec = new Date(date.getTime() - 5 * 60 * 60 * 1000);
  const yy = ec.getUTCFullYear();
  const mm = ec.getUTCMonth() + 1;
  const dd = ec.getUTCDate();
  const pad = (n: number) => String(n).padStart(2, '0');
  if (dd <= 15) {
    return { fechaInicio: `${yy}-${pad(mm)}-01`, fechaFin: `${yy}-${pad(mm)}-15` };
  } else {
    const lastDay = new Date(yy, mm, 0).getDate();
    return { fechaInicio: `${yy}-${pad(mm)}-16`, fechaFin: `${yy}-${pad(mm)}-${pad(lastDay)}` };
  }
}

// ── Helper: increment diasLaborados for employee's current quincena ──────────
async function incrementarDiasLaborados(empleadoId: string, ahora: Date): Promise<void> {
  const { fechaInicio, fechaFin } = getQuincenaPeriod(ahora);
  const periodStart = new Date(`${fechaInicio}T00:00:00.000Z`);
  const periodEnd = new Date(`${fechaFin}T00:00:00.000Z`);

  console.log(`[QR-DIAS] Incrementando diasLaborados para ${empleadoId} — quincena: ${fechaInicio} / ${fechaFin}`);

  const existing = await prisma.nominaRegistro.findFirst({
    where: { empleadoId, fechaInicio: periodStart, fechaFin: periodEnd },
  });

  if (existing) {
    const nuevoDias = existing.diasLaborados + 1;
    await prisma.nominaRegistro.update({
      where: { id: existing.id },
      data: { diasLaborados: nuevoDias },
    });
    console.log(`[QR-DIAS] diasLaborados: ${existing.diasLaborados} → ${nuevoDias}`);
  } else {
    const defIng = { horasExtras: 0, trabajosEnEmpresa: 0, fondosReserva: 0 };
    const defEgr = { extensionConyuge: 0, prestamoQuirografario: 0, anticipos: 0, multas: 0, dctoFiesta: 0, dctoHerramientas: 0, dctoGenerico: 0, permisosDetalle: [] };
    await prisma.nominaRegistro.create({
      data: {
        empleadoId,
        fechaInicio: periodStart,
        fechaFin: periodEnd,
        diasLaborables: 15,
        diasLaborados: 1,
        permisoHoras: 0,
        ingresos: defIng,
        egresos: defEgr,
        abonos: [],
        estado: 'PENDIENTE',
      },
    });
    console.log(`[QR-DIAS] Registro creado con diasLaborados: 1`);
  }
}

function calculateLateHoursEcuador(fechaHora: Date): number {
  const ecDate = new Date(fechaHora.getTime() - 5 * 60 * 60 * 1000);
  const day = ecDate.getUTCDay();
  if (day === 0) return 0; // Sundays don't count

  const hours = ecDate.getUTCHours();
  const minutes = ecDate.getUTCMinutes();
  const timeInMinutes = hours * 60 + minutes;

  const expectedTime = (day === 6) ? (9 * 60) : (8 * 60);
  const diff = timeInMinutes - expectedTime;

  if (diff <= 5) return 0;

  const halfHours = Math.round(diff / 30);
  return Math.max(0.5, halfHours * 0.5);
}

export class AsistenciaService {
  constructor(private readonly asistenciaRepository: AsistenciaRepositoryPort) {}

  async listAsistencias(desdeStr: string, hastaStr: string): Promise<Asistencia[]> {
    const desde = new Date(`${desdeStr}T00:00:00.000-05:00`);
    const hasta = new Date(`${hastaStr}T23:59:59.999-05:00`);

    return this.asistenciaRepository.findAll(desde, hasta);
  }

  async getProximaMarcacion(empleadoId: string) {
    const [todayMarks, emp] = await Promise.all([
      this.asistenciaRepository.findTodayByEmpleado(empleadoId),
      prisma.empleado.findUnique({ where: { id: empleadoId }, select: { tipoContrato: true } }),
    ]);
    const tipoContrato = emp?.tipoContrato || 'Tiempo Completo';

    const nowEcuador = new Date(Date.now() - 5 * 60 * 60 * 1000);
    const dateStr = nowEcuador.toISOString().split('T')[0];
    const { diaConfig } = await getHorarioDelDia(dateStr);

    const opciones = getOpcionesMarcacion(todayMarks, tipoContrato, diaConfig);
    const base = resolveProximaMarcacion(todayMarks, tipoContrato, diaConfig);
    return { ...base, opciones, tipoContrato };
  }

  async getTodayForEmpleado(empleadoId: string): Promise<Asistencia[]> {
    return this.asistenciaRepository.findTodayByEmpleado(empleadoId);
  }

  async registrarAsistencia(input: {
    empleadoId: string;
    ubicacionLat: number | null;
    ubicacionLng: number | null;
    omitirAlmuerzo?: boolean;
    tipo?: string;
  }): Promise<Record<string, unknown>> {
    const empleado = await prisma.empleado.findUnique({
      where: { id: input.empleadoId },
      select: { nombre: true, tipoContrato: true },
    });

    if (!empleado) {
      throw new Error(`Empleado con ID '${input.empleadoId}' no encontrado en el sistema.`);
    }

    const tipoContrato = empleado.tipoContrato || 'Tiempo Completo';

    // ── Tiempo canónico ──────────────────────────────────────────────────────
    // ahora  = UTC real (para guardar en DB)
    // ahoraEC = Ecuador (UTC-5) para cálculos de hora local y dateStr
    const ahora = new Date();
    const ahoraEC = new Date(ahora.getTime() - 5 * 60 * 60 * 1000);

    const dateStr = ahoraEC.toISOString().split('T')[0]; // 'YYYY-MM-DD' en hora Ecuador
    const { diaConfig } = await getHorarioDelDia(dateStr);

    const todayMarks = await this.asistenciaRepository.findTodayByEmpleado(input.empleadoId);
    if (!puedeRegistrarMarcacion(todayMarks, tipoContrato, diaConfig)) {
      throw new Error(`El colaborador ${empleado.nombre} ya completó las marcaciones del día.`);
    }

    const proxima = resolveTipoRegistro(todayMarks, {
      omitirAlmuerzo: input.omitirAlmuerzo,
      horaActual: ahoraEC, // usa la hora EC (posiblemente simulada) para resolver el paso correcto
      tipo: input.tipo,
      tipoContrato,
      diaConfig,
    });

    const asistencia = await this.asistenciaRepository.create({
      empleadoId: input.empleadoId,
      tipo: proxima.tipo,
      label: proxima.label,
      fechaHora: ahora.toISOString(),
      ubicacionLat: input.ubicacionLat,
      ubicacionLng: input.ubicacionLng,
    });

    let horasExtra: Record<string, unknown> | undefined;

    // ── SALIDA ────────────────────────────────────────────────────────────────
    if (proxima.tipo === 'SALIDA') {
      // Overtime is NOT created automatically on SALIDA.
      // Employees explicitly mark FIN_HORAS_EXTRA after the 30-min tolerance window.
      await incrementarDiasLaborados(input.empleadoId, ahora);
    }


    // ── FIN_ALMUERZO (atraso) ────────────────────────────────────────────────
    if (proxima.tipo === 'FIN_ALMUERZO') {
      const inicioAlmMark = todayMarks.find((m) => m.tipo === 'INICIO_ALMUERZO');
      if (inicioAlmMark && diaConfig?.inicioAlmuerzo && diaConfig?.finAlmuerzo) {
        const salidaAlmTime = new Date(inicioAlmMark.fechaHora);
        const actualDurationMinutes = (ahora.getTime() - salidaAlmTime.getTime()) / 60000;

        const [ish, ism] = diaConfig.inicioAlmuerzo.split(':').map(Number);
        const [fsh, fsm] = diaConfig.finAlmuerzo.split(':').map(Number);
        const configuredDurationMinutes = (fsh * 60 + fsm) - (ish * 60 + ism);

        // Minutes the employee overstayed in lunch
        const lateMinutesAlm = Math.round(actualDurationMinutes - configuredDurationMinutes);

        // Load tolerance from config
        const horariosConfigAlm = (await (await import('../../infrastructure/adapters/persistence/horarioLaboralStore.js')).loadHorariosLaborales()) as any;
        const toleranciaAlm = Number(horariosConfigAlm.toleranciaMinutos ?? 8);

        // Apply bracket system — same as entry fines
        const { calcularMultaAtraso: calcMultaAlm } = await import('../../../../shared/utils/horarioLaboralHelpers.js');
        const multaDolaresAlm = calcMultaAlm(lateMinutesAlm, toleranciaAlm);

        console.log(`[QR-ALM] ${input.empleadoId} | duracion=${actualDurationMinutes.toFixed(1)}min (config=${configuredDurationMinutes}) | tarde=${lateMinutesAlm}min | tol=${toleranciaAlm} | multa=$${multaDolaresAlm}`);

        if (multaDolaresAlm > 0) {
          const { fechaInicio, fechaFin } = getQuincenaPeriod(ahora);
          const periodStart = new Date(`${fechaInicio}T00:00:00.000Z`);
          const periodEnd = new Date(`${fechaFin}T00:00:00.000Z`);

          const defaultIng = { horasExtras: 0, trabajosEnEmpresa: 0, fondosReserva: 0 };
          const defaultEgr = { extensionConyuge: 0, prestamoQuirografario: 0, anticipos: 0, multas: 0, dctoFiesta: 0, dctoHerramientas: 0, dctoGenerico: 0, permisosDetalle: [] };

          const existingNomina = await prisma.nominaRegistro.findFirst({
            where: { empleadoId: input.empleadoId, fechaInicio: periodStart, fechaFin: periodEnd },
          });

          const egresosObj = existingNomina
            ? (typeof existingNomina.egresos === 'string' ? JSON.parse(existingNomina.egresos) : (existingNomina.egresos || {}))
            : defaultEgr;
          const permisosDetalle = Array.isArray(egresosObj.permisosDetalle) ? egresosObj.permisosDetalle : [];

          // Avoid duplicates for this day
          const hasAlmAtrasoToday = permisosDetalle.some(
            (p: any) => p.fecha === dateStr && p.tipo === 'ATRASO_QR_ALMUERZO'
          );

          if (!hasAlmAtrasoToday) {
            const horaMarcacion = new Date(ahora.getTime() - 5 * 3600000).toISOString().slice(11, 16);
            const newPermission = {
              id: `qr-alm-${Date.now()}-${Math.random()}`,
              fecha: dateStr,
              horaMarcacion,
              horas: multaDolaresAlm,
              multaDolares: multaDolaresAlm,
              atrasoMinutos: lateMinutesAlm,
              motivo: `Atraso reg. almuerzo QR ${horaMarcacion} (+${lateMinutesAlm} min)`,
              tipo: 'ATRASO_QR_ALMUERZO',
            };

            const updatedPermisos = [...permisosDetalle, newPermission];
            const newPermisoHoras = updatedPermisos
              .filter((r: any) => !r.eliminado)
              .reduce((sum: number, item: any) => sum + Number(item.multaDolares ?? item.horas ?? 0), 0);

            await prisma.nominaRegistro.upsert({
              where: {
                empleadoId_fechaInicio_fechaFin: {
                  empleadoId: input.empleadoId,
                  fechaInicio: periodStart,
                  fechaFin: periodEnd,
                },
              },
              create: {
                empleadoId: input.empleadoId,
                fechaInicio: periodStart,
                fechaFin: periodEnd,
                diasLaborables: 15,
                diasLaborados: 0,
                permisoHoras: newPermisoHoras,
                ingresos: defaultIng,
                egresos: { ...defaultEgr, permisosDetalle: updatedPermisos },
                abonos: [],
                estado: 'PENDIENTE',
              },
              update: {
                permisoHoras: newPermisoHoras,
                egresos: { ...egresosObj, permisosDetalle: updatedPermisos },
              },
            });

            console.log(`[QR-ALM] multa registrada: $${multaDolaresAlm} | permisoHoras=${newPermisoHoras}`);
          }
        }
      }
    }

    // ── FIN_HORAS_EXTRA ──────────────────────────────────────────────────────
    if (proxima.tipo === 'FIN_HORAS_EXTRA') {
      if (!diaConfig?.salida) {
        throw new Error('No se encontró la hora de salida configurada para calcular horas extras.');
      }

      // ── Auto-register SALIDA at configured exit time if employee never marked it ──
      // Handles the case where someone stays past salidaMin+30 without marking SALIDA first.
      const hasSalidaPrevia = todayMarks.some((m) => m.tipo === 'SALIDA');
      if (!hasSalidaPrevia) {
        const [sh, sm] = diaConfig.salida.split(':').map(Number);
        const [yy, mo, dd] = dateStr.split('-').map(Number);
        // Build the configured exit timestamp in UTC (Ecuador = UTC-5 → +5h offset)
        const salidaAutoUTC = new Date(Date.UTC(yy, mo - 1, dd, sh + 5, sm, 0));
        await this.asistenciaRepository.create({
          empleadoId: input.empleadoId,
          tipo: 'SALIDA',
          label: 'Salida (automático)',
          fechaHora: salidaAutoUTC.toISOString(),
          ubicacionLat: input.ubicacionLat,
          ubicacionLng: input.ubicacionLng,
        });
        console.log(`[QR-FHE] Auto-created SALIDA at ${diaConfig.salida} for ${input.empleadoId} (no prior SALIDA found)`);
        // Count as worked day (normally done in the SALIDA block)
        await incrementarDiasLaborados(input.empleadoId, ahora);
      }

      // Get configurable rates (fall back to defaults if not set)
      const horariosConfig = (await (await import('../../infrastructure/adapters/persistence/horarioLaboralStore.js')).loadHorariosLaborales()) as any;
      const valorHoraExtra      = Number(horariosConfig.valorHoraExtra      ?? VALOR_HORA_EXTRA_DEFAULT);
      const valorMediaHoraExtra = Number(horariosConfig.valorMediaHoraExtra ?? VALOR_MEDIA_HORA_EXTRA_DEFAULT);

      // Calculate from scheduled exit (17:30), not from when SALIDA was stamped
      const { horas: horasExactas, detalleHorario } = calcularHorasExtrasDesdeConfig(
        diaConfig,
        ahora,
        dateStr,
      );

      // Round to nearest half-hour for billing
      const horasRedondeadas = redondearAMediaHora(horasExactas);

      // Suggested billing value: half-hours × 1.5, full hours × (2.5 − 1.5) additional
      // i.e. each 0.5h = valorMediaHoraExtra, each full hour adds another valorMediaHoraExtra
      const medias = horasRedondeadas * 2; // number of 0.5-hour slots
      const suggestedTotal = Math.round(medias * valorMediaHoraExtra * 100) / 100;

      const fechaDia = new Date(ahora);
      fechaDia.setHours(0, 0, 0, 0);

      const created = await prisma.horaExtra.create({
        data: {
          fecha: fechaDia,
          colaboradorId: input.empleadoId,
          horas: horasExactas,          // exact minutes for reference
          detalleHorario,
          descripcion: `Horas extras — ${detalleHorario} (${horasRedondeadas}h facturado)`,
          valorPorHora: valorHoraExtra,
          total: suggestedTotal,        // pre-filled; admin can edit before approving
          estado: 'DEUDOR',
          aprobacionEstado: 'PENDIENTE',
          origen: 'ASISTENCIA',
          asistenciaFinId: asistencia.id,
        },
      });

      horasExtra = {
        id: created.id,
        horas: Number(created.horas),
        horasFacturadas: horasRedondeadas,
        detalleHorario: created.detalleHorario,
        valorPorHora: Number(created.valorPorHora),
        valorMediaHora: valorMediaHoraExtra,
        total: Number(created.total),
        aprobacionEstado: created.aprobacionEstado,
      };

      void notifyHorasExtrasPendiente({
        colaboradorNombre: empleado.nombre,
        horas: horasExactas,
        total: suggestedTotal,
        fecha: fechaDia.toISOString().split('T')[0],
        detalleHorario,
        createdBy: 'Quiosco de asistencia',
      });
    }

    // ── SALIDA_PERMISO ───────────────────────────────────────────────────────
    if (proxima.tipo === 'SALIDA_PERMISO') {
      const entradaMark = todayMarks.find((m) => m.tipo === 'ENTRADA');
      if (entradaMark) {
        const entradaTime = new Date(entradaMark.fechaHora).getTime();
        const hoursWorked = Math.max(0, (ahora.getTime() - entradaTime) / 3600000);

        // Determine the expected full-shift hours from diaConfig
        // For Medio Día employees OR Sábado config: use entrance→exit minus optional lunch
        let expectedShiftHours = 8; // default for full-time weekday
        if (diaConfig?.entrada && diaConfig?.salida) {
          const [eh, em] = diaConfig.entrada.split(':').map(Number);
          const [sh, sm] = diaConfig.salida.split(':').map(Number);
          const rawMinutes = (sh * 60 + sm) - (eh * 60 + em);
          let lunchMinutes = 0;
          if (!diaConfig.almuerzoOpcional && diaConfig.inicioAlmuerzo && diaConfig.finAlmuerzo) {
            const [lih, lim] = diaConfig.inicioAlmuerzo.split(':').map(Number);
            const [lfh, lfm] = diaConfig.finAlmuerzo.split(':').map(Number);
            lunchMinutes = (lfh * 60 + lfm) - (lih * 60 + lim);
          }
          expectedShiftHours = Math.max(1, (rawMinutes - lunchMinutes) / 60);
        } else if (tipoContrato === 'Medio Día') {
          expectedShiftHours = 4;
        }

        const remainingHours = Math.round(Math.max(0, expectedShiftHours - hoursWorked) * 100) / 100;
        console.log(`[QR-SP] SALIDA_PERMISO ${input.empleadoId} | tipo=${tipoContrato} | expected=${expectedShiftHours}h | worked=${hoursWorked.toFixed(2)}h | remaining=${remainingHours}h`);

        // Si trabajó menos que su jornada completa → registrar descuento de horas
        if (remainingHours > 0) {
          const { fechaInicio, fechaFin } = getQuincenaPeriod(ahora);
          const periodStart = new Date(`${fechaInicio}T00:00:00.000Z`);
          const periodEnd = new Date(`${fechaFin}T00:00:00.000Z`);

          const defaultIng = { horasExtras: 0, trabajosEnEmpresa: 0, fondosReserva: 0 };
          const defaultEgr = { extensionConyuge: 0, prestamoQuirografario: 0, anticipos: 0, multas: 0, dctoFiesta: 0, dctoHerramientas: 0, dctoGenerico: 0, permisosDetalle: [] };

          const existing = await prisma.nominaRegistro.findFirst({
            where: { empleadoId: input.empleadoId, fechaInicio: periodStart, fechaFin: periodEnd },
          });

          const egresosObj = existing
            ? (typeof existing.egresos === 'string' ? JSON.parse(existing.egresos) : (existing.egresos || {}))
            : defaultEgr;
          const permisosDetalle = Array.isArray(egresosObj.permisosDetalle) ? egresosObj.permisosDetalle : [];


          const newPermission = {
            id: `qr-permiso-${Date.now()}-${Math.random()}`,
            fecha: dateStr,
            horas: remainingHours,
            motivo: `Salida con permiso registrada por QR (Trabajó ${hoursWorked.toFixed(1)}h)`,
            tipo: 'PERMISO_SALIDA',
          };

          const updatedPermisos = [...permisosDetalle, newPermission];
          const newPermisoHoras = updatedPermisos.reduce((sum, item) => sum + Number(item.horas || 0), 0);

          if (existing) {
            await prisma.nominaRegistro.update({
              where: { id: existing.id },
              data: {
                diasLaborados: existing.diasLaborados + 1,
                permisoHoras: newPermisoHoras,
                egresos: { ...egresosObj, permisosDetalle: updatedPermisos },
              },
            });
            console.log(`[QR-SP] diasLaborados: ${existing.diasLaborados} → ${existing.diasLaborados + 1} | permisoHoras: ${newPermisoHoras}`);
          } else {
            await prisma.nominaRegistro.create({
              data: {
                empleadoId: input.empleadoId,
                fechaInicio: periodStart,
                fechaFin: periodEnd,
                diasLaborables: 15,
                diasLaborados: 1,
                permisoHoras: newPermisoHoras,
                ingresos: defaultIng,
                egresos: { ...defaultEgr, permisosDetalle: updatedPermisos },
                abonos: [],
                estado: 'PENDIENTE',
              },
            });
            console.log(`[QR-SP] Registro creado con diasLaborados: 1 | permisoHoras: ${newPermisoHoras}`);
          }
        } else {
          // Trabajó jornada completa → solo incrementar días
          await incrementarDiasLaborados(input.empleadoId, ahora);
        }
      }
    }

    // ── ENTRADA con atraso ───────────────────────────────────────────────────
    if (proxima.tipo === 'ENTRADA') {
      // Load config for tolerance and bracket calculation
      const horariosConfigEnt = (await (await import('../../infrastructure/adapters/persistence/horarioLaboralStore.js')).loadHorariosLaborales()) as any;
      const toleranciaEnt = Number(horariosConfigEnt.toleranciaMinutos ?? 8);
      const { calcularMultaAtraso: calcMultaEnt } = await import('../../../../shared/utils/horarioLaboralHelpers.js');

      // Calculate minutes late from the configured entrada time
      const entradaHora: string = diaConfig?.entrada ?? '08:00';
      const [eh, em] = entradaHora.split(':').map(Number);
      const minutosActual = ahoraEC.getUTCHours() * 60 + ahoraEC.getUTCMinutes();
      const minutosEntrada = eh * 60 + em;
      const atrasoMinutosEnt = Math.max(0, minutosActual - minutosEntrada);
      const horaMarcacion = `${String(ahoraEC.getUTCHours()).padStart(2,'0')}:${String(ahoraEC.getUTCMinutes()).padStart(2,'0')}`;

      // Apply bracket system — respects toleranciaMinutos
      const multaDolaresEnt = calcMultaEnt(atrasoMinutosEnt, toleranciaEnt);

      console.log(`[QR-ENT] ${input.empleadoId} | hora=${horaMarcacion} | atraso=${atrasoMinutosEnt}min | tol=${toleranciaEnt} | multa=$${multaDolaresEnt}`);

      if (multaDolaresEnt > 0) {
        const { fechaInicio, fechaFin } = getQuincenaPeriod(ahora);
        const periodStart = new Date(`${fechaInicio}T00:00:00.000Z`);
        const periodEnd = new Date(`${fechaFin}T00:00:00.000Z`);

        const defaultIng = { horasExtras: 0, trabajosEnEmpresa: 0, fondosReserva: 0 };
        const defaultEgr = { extensionConyuge: 0, prestamoQuirografario: 0, anticipos: 0, multas: 0, dctoFiesta: 0, dctoHerramientas: 0, dctoGenerico: 0, permisosDetalle: [] };

        // ── Buscar el NominaRegistro de la quincena usando rango de fechas (robusto a timezone) ──
        const existing = await prisma.nominaRegistro.findFirst({
          where: {
            empleadoId: input.empleadoId,
            fechaInicio: { lte: periodEnd },
            fechaFin:    { gte: periodStart },
          },
        });

        const egresosObj = existing
          ? (typeof existing.egresos === 'string' ? JSON.parse(existing.egresos) : (existing.egresos || {}))
          : defaultEgr;
        const permisosDetalle = Array.isArray(egresosObj.permisosDetalle) ? egresosObj.permisosDetalle : [];

        // Evitar duplicado del mismo día
        const hasAtrasoToday = permisosDetalle.some(
          (p: any) => p.fecha === dateStr && p.tipo === 'ATRASO_QR'
        );

        if (!hasAtrasoToday) {
          const newPermission = {
            id: `qr-atraso-${Date.now()}-${Math.random()}`,
            fecha: dateStr,
            horaMarcacion,
            horas: multaDolaresEnt,
            multaDolares: multaDolaresEnt,
            atrasoMinutos: atrasoMinutosEnt,
            motivo: `Atraso entrada QR ${horaMarcacion} (+${atrasoMinutosEnt} min)`,
            tipo: 'ATRASO_QR',
          };

          const updatedPermisos = [...permisosDetalle, newPermission];
          const newPermisoHoras = updatedPermisos
            .filter((r: any) => !r.eliminado)
            .reduce((sum: number, item: any) => sum + Number(item.multaDolares ?? item.horas ?? 0), 0);

          if (existing) {
            // Actualizar por id — nunca falla por timezone
            await prisma.nominaRegistro.update({
              where: { id: existing.id },
              data: {
                permisoHoras: newPermisoHoras,
                egresos: { ...egresosObj, permisosDetalle: updatedPermisos },
              },
            });
          } else {
            // No existe aún — crear con la fecha correcta de la quincena
            await prisma.nominaRegistro.create({
              data: {
                empleadoId: input.empleadoId,
                fechaInicio: periodStart,
                fechaFin: periodEnd,
                diasLaborables: 15,
                diasLaborados: 0,
                permisoHoras: newPermisoHoras,
                ingresos: defaultIng,
                egresos: { ...defaultEgr, permisosDetalle: updatedPermisos },
                abonos: [],
                estado: 'PENDIENTE',
              },
            });
          }

          console.log(`[QR-ENT] multa registrada: $${multaDolaresEnt} | permisoHoras=${newPermisoHoras} | registro=${existing ? 'updated:' + existing.id : 'created'}`);
        } else {
          console.log(`[QR-ENT] ${input.empleadoId} | ATRASO_QR ya registrado para ${dateStr} — skipping duplicate`);
        }
      } else {
        console.log(`[QR-ENT] ${input.empleadoId} | atraso=${atrasoMinutosEnt}min ≤ tol=${toleranciaEnt} → SIN multa`);
      }
    }

    const result = new Asistencia({
      ...asistencia.toJSON(),
      nombreEmpleado: empleado.nombre,
    });

    return {
      ...result.toJSON(),
      ...(horasExtra ? { horasExtra } : {}),
    };
  }

  async registrarPermiso(input: {
    empleadoId: string;
    fecha: string;
  }): Promise<Asistencia> {
    const empleado = await prisma.empleado.findUnique({
      where: { id: input.empleadoId },
      select: { nombre: true },
    });

    if (!empleado) {
      throw new Error(`Empleado con ID '${input.empleadoId}' no encontrado.`);
    }

    const start = new Date(`${input.fecha}T00:00:00.000-05:00`);
    const end = new Date(`${input.fecha}T23:59:59.999-05:00`);

    // Solo verificamos si ya existe un registro de tipo PERMISO para evitar duplicados
    const existingPermiso = await prisma.asistencia.findFirst({
      where: {
        empleadoId: input.empleadoId,
        tipo: 'PERMISO',
        fechaHora: { gte: start, lte: end },
      },
    });

    if (existingPermiso) {
      throw new Error(`El colaborador ya tiene un permiso registrado para el día ${input.fecha}.`);
    }

    const asistencia = await this.asistenciaRepository.create({
      empleadoId: input.empleadoId,
      tipo: 'PERMISO',
      label: 'Permiso Pagado',
      fechaHora: start.toISOString(),
      ubicacionLat: null,
      ubicacionLng: null,
    });

    return new Asistencia({
      ...asistencia.toJSON(),
      nombreEmpleado: empleado.nombre,
    });
  }

  async eliminarPermiso(input: {
    empleadoId: string;
    fecha: string;
  }): Promise<void> {
    const start = new Date(`${input.fecha}T00:00:00.000-05:00`);
    const end = new Date(`${input.fecha}T23:59:59.999-05:00`);

    await prisma.asistencia.deleteMany({
      where: {
        empleadoId: input.empleadoId,
        tipo: 'PERMISO',
        fechaHora: { gte: start, lte: end },
      },
    });
  }
}
