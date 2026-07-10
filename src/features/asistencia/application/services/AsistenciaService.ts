import { Asistencia } from '../../domain/entities/Asistencia.js';
import { AsistenciaRepositoryPort } from '../../domain/ports/AsistenciaRepositoryPort.js';
import {
  SECUENCIA_MARCACIONES,
  resolveProximaMarcacion,
  resolveTipoRegistro,
  getOpcionesMarcacion,
  calcularHorasExtrasDesdeSalida,
  puedeRegistrarMarcacion,
} from '../../domain/marcacionLogic.js';
import { prisma } from '../../../../config/prismaClient.js';
import { notifyHorasExtrasPendiente } from '../../../../shared/services/horasExtrasNotificationService.js';

export { SECUENCIA_MARCACIONES };

const VALOR_HORA_EXTRA_DEFAULT = 2.5;

export class AsistenciaService {
  constructor(private readonly asistenciaRepository: AsistenciaRepositoryPort) {}

  async listAsistencias(desdeStr: string, hastaStr: string): Promise<Asistencia[]> {
    const desde = new Date(desdeStr);
    desde.setHours(0, 0, 0, 0);

    const hasta = new Date(hastaStr);
    hasta.setHours(23, 59, 59, 999);

    return this.asistenciaRepository.findAll(desde, hasta);
  }

  async getProximaMarcacion(empleadoId: string) {
    const todayMarks = await this.asistenciaRepository.findTodayByEmpleado(empleadoId);
    const opciones = getOpcionesMarcacion(todayMarks);
    const base = resolveProximaMarcacion(todayMarks);
    return { ...base, opciones };
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
      select: { nombre: true },
    });

    if (!empleado) {
      throw new Error(`Empleado con ID '${input.empleadoId}' no encontrado en el sistema.`);
    }

    const todayMarks = await this.asistenciaRepository.findTodayByEmpleado(input.empleadoId);
    if (!puedeRegistrarMarcacion(todayMarks)) {
      throw new Error(`El colaborador ${empleado.nombre} ya completó las marcaciones del día.`);
    }

    const ahora = new Date();
    const proxima = resolveTipoRegistro(todayMarks, {
      omitirAlmuerzo: input.omitirAlmuerzo,
      horaActual: ahora,
      tipo: input.tipo,
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

    if (proxima.tipo === 'FIN_HORAS_EXTRA') {
      const { horas, detalleHorario } = calcularHorasExtrasDesdeSalida(todayMarks, ahora);
      const valorPorHora = VALOR_HORA_EXTRA_DEFAULT;
      const total = Math.round(horas * valorPorHora * 100) / 100;
      const fechaDia = new Date(ahora);
      fechaDia.setHours(0, 0, 0, 0);

      const created = await prisma.horaExtra.create({
        data: {
          fecha: fechaDia,
          colaboradorId: input.empleadoId,
          horas,
          detalleHorario,
          descripcion: 'Horas extras registradas desde asistencia (pendiente validación)',
          valorPorHora,
          total,
          estado: 'DEUDOR',
          aprobacionEstado: 'PENDIENTE',
          origen: 'ASISTENCIA',
          asistenciaFinId: asistencia.id,
        },
      });

      horasExtra = {
        id: created.id,
        horas: Number(created.horas),
        detalleHorario: created.detalleHorario,
        valorPorHora: Number(created.valorPorHora),
        total: Number(created.total),
        aprobacionEstado: created.aprobacionEstado,
      };

      void notifyHorasExtrasPendiente({
        colaboradorNombre: empleado.nombre,
        horas: Number(created.horas),
        total: Number(created.total),
        fecha: fechaDia.toISOString().split('T')[0],
        detalleHorario: created.detalleHorario,
        createdBy: 'Quiosco de asistencia',
      });
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

    const targetDate = new Date(input.fecha + 'T00:00:00');
    const start = new Date(targetDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(targetDate);
    end.setHours(23, 59, 59, 999);

    const existing = await prisma.asistencia.findFirst({
      where: {
        empleadoId: input.empleadoId,
        fechaHora: {
          gte: start,
          lte: end,
        },
      },
    });

    if (existing) {
      throw new Error(`El colaborador ya tiene registros de asistencia o permisos para el día ${input.fecha}.`);
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
    const targetDate = new Date(input.fecha + 'T00:00:00');
    const start = new Date(targetDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(targetDate);
    end.setHours(23, 59, 59, 999);

    await prisma.asistencia.deleteMany({
      where: {
        empleadoId: input.empleadoId,
        tipo: 'PERMISO',
        fechaHora: {
          gte: start,
          lte: end,
        },
      },
    });
  }
}
