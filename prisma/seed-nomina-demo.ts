/**
 * Datos de demostración: asistencias + horas extras + nómina
 * para ver días trabajados e ingresos por HE en la planilla.
 *
 * Uso: npm run db:seed-nomina-demo
 */
import { PrismaClient } from '@prisma/client';
import {
  calcDiasLaborables,
  calcDiasLaborados,
} from '../src/shared/utils/nominaPeriodoHelpers.js';
import {
  calcSueldoBrutoQuincena,
  sueldoQuincenaBase,
} from '../src/shared/utils/sueldoHelpers.js';
import {
  computeDecimosProvisions,
  ingresosGravadosPeriodo,
  loadSbuVigente,
} from '../src/shared/utils/decimosEcuadorHelpers.js';
import { notifyHorasExtrasPendiente } from '../src/shared/services/horasExtrasNotificationService.js';

const prisma = new PrismaClient();

const DEMO_EMP_CONTRATO = 'EMP-002'; // María Fernanda Torres
const DEMO_EMP_ASISTENCIA = 'EMP-001'; // Andrés Israel (admin empleado)

const Q1_INICIO = '2026-06-01';
const Q1_FIN = '2026-06-15';
const Q2_INICIO = '2026-06-16';
const Q2_FIN = '2026-06-30';

/** Días laborales lun–sáb en el rango (sin domingos). */
function diasLaboralesEnRango(inicio: string, fin: string): string[] {
  const out: string[] = [];
  const cursor = new Date(`${inicio}T12:00:00`);
  const end = new Date(`${fin}T12:00:00`);
  while (cursor <= end) {
    const dow = cursor.getDay();
    if (dow >= 1 && dow <= 6) {
      out.push(cursor.toISOString().slice(0, 10));
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

function marcacionesDia(empleadoId: string, fecha: string, horaSalida = '17:30:00') {
  const base = `${fecha}T`;
  return [
    { empleadoId, tipo: 'ENTRADA', label: 'Entrada', fechaHora: new Date(`${base}08:00:00-05:00`) },
    { empleadoId, tipo: 'INICIO_ALMUERZO', label: 'Inicio almuerzo', fechaHora: new Date(`${base}13:00:00-05:00`) },
    { empleadoId, tipo: 'FIN_ALMUERZO', label: 'Fin almuerzo', fechaHora: new Date(`${base}14:00:00-05:00`) },
    { empleadoId, tipo: 'SALIDA', label: 'Salida', fechaHora: new Date(`${base}${horaSalida}-05:00`) },
  ];
}

async function limpiarDemo(empleadoIds: string[], inicio: string, fin: string) {
  const fIni = new Date(inicio);
  const fFin = new Date(`${fin}T23:59:59`);

  await prisma.asistencia.deleteMany({
    where: {
      empleadoId: { in: empleadoIds },
      fechaHora: { gte: fIni, lte: fFin },
    },
  });

  await prisma.horaExtra.deleteMany({
    where: {
      colaboradorId: { in: empleadoIds },
      fecha: { gte: fIni, lte: fFin },
    },
  });

  await prisma.nominaRegistro.deleteMany({
    where: {
      empleadoId: { in: empleadoIds },
      fechaInicio: { gte: fIni },
      fechaFin: { lte: new Date(fin) },
    },
  });
}

async function crearMarcaciones(empleadoId: string, fechas: string[]) {
  const rows = fechas.flatMap((f) => marcacionesDia(empleadoId, f));
  if (rows.length === 0) return;
  await prisma.asistencia.createMany({ data: rows });
}

async function upsertNomina(
  empleadoId: string,
  inicio: string,
  fin: string,
  tieneContrato: boolean,
  sueldoMensual: number,
  feriados: { fecha: string; descripcion?: string }[] = [],
) {
  const diasLaborables = calcDiasLaborables(inicio, fin, feriados);
  const asistencias = await prisma.asistencia.findMany({
    where: {
      empleadoId,
      fechaHora: {
        gte: new Date(inicio),
        lte: new Date(`${fin}T23:59:59`),
      },
    },
    select: { fechaHora: true, tipo: true },
  });

  const { diasLaborados } = calcDiasLaborados(asistencias, feriados, inicio, fin, tieneContrato);

  const horasExtras = await prisma.horaExtra.findMany({
    where: {
      colaboradorId: empleadoId,
      fecha: { gte: new Date(inicio), lte: new Date(fin) },
      aprobacionEstado: 'APROBADA',
    },
  });
  const horasExtrasSum = horasExtras.reduce((s, h) => s + Number(h.total), 0);

  const sueldoBruto = tieneContrato
    ? sueldoQuincenaBase(sueldoMensual)
    : calcSueldoBrutoQuincena(sueldoMensual, diasLaborados, diasLaborables);

  const gravado = ingresosGravadosPeriodo(sueldoBruto, horasExtrasSum, 0);
  const sbuVigente = await loadSbuVigente(prisma);
  const year = fin.slice(0, 4);
  const nominasPrevias = await prisma.nominaRegistro.findMany({
    where: {
      empleadoId,
      fechaFin: { gte: new Date(`${year}-01-01`), lt: new Date(fin) },
    },
    orderBy: { fechaFin: 'asc' },
  });

  const empleado = await prisma.empleado.findUnique({ where: { id: empleadoId } });
  const decimos = computeDecimosProvisions({
    gravado,
    sbuVigente,
    fechaInicio: inicio,
    fechaFin: fin,
    tieneContrato,
    decimoTerceroMensualizado: Boolean(empleado?.decimoTerceroMensualizado),
    decimoCuartoMensualizado: Boolean(empleado?.decimoCuartoMensualizado),
    region: empleado?.region === 'sierra' ? 'sierra' : 'costa',
    nominasPreviasAnio: nominasPrevias,
  });

  const iess = tieneContrato ? Math.round(gravado * 0.0945 * 100) / 100 : 0;

  await prisma.nominaRegistro.upsert({
    where: {
      empleadoId_fechaInicio_fechaFin: {
        empleadoId,
        fechaInicio: new Date(inicio),
        fechaFin: new Date(fin),
      },
    },
    update: {
      diasLaborables,
      diasLaborados,
      ingresos: {
        decimoCuarto: 0,
        decimoTercero: 0,
        ...decimos,
        horasExtras: horasExtrasSum,
        trabajosEnEmpresa: 0,
        fondosReserva: 0,
      },
      egresos: {
        iess,
        extensionConyuge: 0,
        prestamoQuirografario: 0,
        anticipos: 0,
        dctoHorasNoLaboradas: 0,
        multas: 0,
        dctoFiesta: 0,
        dctoHerramientas: 0,
        dctoGenerico: 0,
      },
      estado: 'PENDIENTE',
    },
    create: {
      empleadoId,
      fechaInicio: new Date(inicio),
      fechaFin: new Date(fin),
      diasLaborables,
      diasLaborados,
      permisoHoras: 0,
      ingresos: {
        decimoCuarto: 0,
        decimoTercero: 0,
        ...decimos,
        horasExtras: horasExtrasSum,
        trabajosEnEmpresa: 0,
        fondosReserva: 0,
      },
      egresos: {
        iess,
        extensionConyuge: 0,
        prestamoQuirografario: 0,
        anticipos: 0,
        dctoHorasNoLaboradas: 0,
        multas: 0,
        dctoFiesta: 0,
        dctoHerramientas: 0,
        dctoGenerico: 0,
      },
      abonos: [],
      estado: 'PENDIENTE',
    },
  });

  return { diasLaborados, diasLaborables, horasExtrasSum, sueldoBruto };
}

async function main() {
  console.log('🌱 Sembrando demo de nómina (junio 2026)...\n');

  const empleadosDemo = [DEMO_EMP_CONTRATO, DEMO_EMP_ASISTENCIA];
  const existen = await prisma.empleado.findMany({
    where: { id: { in: empleadosDemo } },
    select: { id: true, nombre: true },
  });
  if (existen.length < 2) {
    throw new Error('Ejecuta primero npm run db:seed para crear empleados EMP-001 y EMP-002.');
  }

  await prisma.empleado.update({
    where: { id: DEMO_EMP_CONTRATO },
    data: { sueldoDiario: 500, tieneContrato: true, tipoContrato: 'Fijo' },
  });
  await prisma.empleado.update({
    where: { id: DEMO_EMP_ASISTENCIA },
    data: { sueldoDiario: 600, tieneContrato: false, tipoContrato: 'Por asistencia' },
  });

  await limpiarDemo(empleadosDemo, Q1_INICIO, Q2_FIN);

  const diasQ1 = diasLaboralesEnRango(Q1_INICIO, Q1_FIN);
  const diasQ2 = diasLaboralesEnRango(Q2_INICIO, Q2_FIN);
  const diasMesCompleto = [...diasQ1, ...diasQ2];

  // EMP-002: contrato — mes completo (todas las quincenas)
  await crearMarcaciones(DEMO_EMP_CONTRATO, diasMesCompleto);

  // EMP-001: por asistencia — mes completo
  await crearMarcaciones(DEMO_EMP_ASISTENCIA, diasMesCompleto);

  // María (EMP-002): 5 horas extras PENDIENTES — admin debe aprobar en planilla HE
  await prisma.horaExtra.create({
    data: {
      id: 'HE-DEMO-001',
      fecha: new Date('2026-06-05'),
      colaboradorId: DEMO_EMP_CONTRATO,
      horas: 5,
      detalleHorario: '17:30 - 22:30',
      descripcion: 'Producción extra — 5 horas (pendiente aprobación)',
      valorPorHora: 2.5,
      total: 12.5,
      estado: 'DEUDOR',
      aprobacionEstado: 'PENDIENTE',
      origen: 'ASISTENCIA',
    },
  });

  // Andrés (EMP-001): 3 horas extras PENDIENTES — segunda solicitud para aprobar
  await prisma.horaExtra.create({
    data: {
      id: 'HE-DEMO-002',
      fecha: new Date('2026-06-12'),
      colaboradorId: DEMO_EMP_ASISTENCIA,
      horas: 3,
      detalleHorario: '18:00 - 21:00',
      descripcion: 'Soporte en obra — 3 horas (pendiente aprobación)',
      valorPorHora: 2.5,
      total: 7.5,
      estado: 'DEUDOR',
      aprobacionEstado: 'PENDIENTE',
      origen: 'ASISTENCIA',
    },
  });

  const empNames = await prisma.empleado.findMany({
    where: { id: { in: empleadosDemo } },
    select: { id: true, nombre: true },
  });
  const nameById = Object.fromEntries(empNames.map((e) => [e.id, e.nombre]));

  await notifyHorasExtrasPendiente({
    colaboradorNombre: nameById[DEMO_EMP_CONTRATO] || 'María',
    horas: 5,
    total: 12.5,
    fecha: '2026-06-05',
    detalleHorario: '17:30 - 22:30',
    createdBy: 'Demo nómina',
  });
  await notifyHorasExtrasPendiente({
    colaboradorNombre: nameById[DEMO_EMP_ASISTENCIA] || 'Andrés',
    horas: 3,
    total: 7.5,
    fecha: '2026-06-12',
    detalleHorario: '18:00 - 21:00',
    createdBy: 'Demo nómina',
  });

  const resQ1Contrato = await upsertNomina(DEMO_EMP_CONTRATO, Q1_INICIO, Q1_FIN, true, 500, []);
  const resQ1Asist = await upsertNomina(DEMO_EMP_ASISTENCIA, Q1_INICIO, Q1_FIN, false, 600, []);
  const resQ2Contrato = await upsertNomina(DEMO_EMP_CONTRATO, Q2_INICIO, Q2_FIN, true, 500, []);
  const resQ2Asist = await upsertNomina(DEMO_EMP_ASISTENCIA, Q2_INICIO, Q2_FIN, false, 600, []);

  const totalDiasMaría = resQ1Contrato.diasLaborados + resQ2Contrato.diasLaborados;
  const totalDiasAndrés = resQ1Asist.diasLaborados + resQ2Asist.diasLaborados;
  const totalHEMaría = resQ1Contrato.horasExtrasSum + resQ2Contrato.horasExtrasSum;
  const totalHEAndrés = resQ1Asist.horasExtrasSum + resQ2Asist.horasExtrasSum;

  console.log('✅ Datos insertados correctamente (mes completo junio 2026).\n');
  console.log('── 1ra quincena (01–15) ──');
  console.log(`  María (EMP-002, contrato $500/mes):`);
  console.log(`    Días trabajados: ${resQ1Contrato.diasLaborados} / ${resQ1Contrato.diasLaborables}`);
  console.log(`    Sueldo bruto quincena: $${resQ1Contrato.sueldoBruto.toFixed(2)}`);
  console.log(`    Horas extras (aprobadas): $${resQ1Contrato.horasExtrasSum.toFixed(2)}`);
  console.log(`  Andrés (EMP-001, por asistencia $600/mes):`);
  console.log(`    Días trabajados: ${resQ1Asist.diasLaborados} / ${resQ1Asist.diasLaborables}`);
  console.log(`    Sueldo bruto quincena: $${resQ1Asist.sueldoBruto.toFixed(2)}`);
  console.log(`    Horas extras (aprobadas): $${resQ1Asist.horasExtrasSum.toFixed(2)}`);
  console.log('\n── 2da quincena (16–30) ──');
  console.log(`  María: ${resQ2Contrato.diasLaborados} / ${resQ2Contrato.diasLaborables} días, HE $${resQ2Contrato.horasExtrasSum.toFixed(2)}`);
  console.log(`  Andrés: ${resQ2Asist.diasLaborados} / ${resQ2Asist.diasLaborables} días, HE $${resQ2Asist.horasExtrasSum.toFixed(2)}`);
  console.log('\n── Totales del mes ──');
  console.log(`  María: ${totalDiasMaría} días trabajados, HE $${totalHEMaría.toFixed(2)}`);
  console.log(`  Andrés: ${totalDiasAndrés} días trabajados, HE $${totalHEAndrés.toFixed(2)}`);
  console.log('\n📋 En el frontend: Nómina → Junio 2026 → quincena 1 o 2');
  console.log('   Columna "Días T." = días trabajados');
  console.log('   Columna "Ingresos Var." incluye horas extras (clic para detalle)');
  console.log('   También en /nomina/horas-extras');
  console.log('   Pendientes HE: María 5h ($12.50) + Andrés 3h ($7.50) — Junio 2026\n');
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
