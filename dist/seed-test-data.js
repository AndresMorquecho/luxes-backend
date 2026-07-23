/**
 * seed-test-data.ts
 * Script para insertar datos de prueba de asistencia y horas extras directamente en la BD.
 *
 * Ejecutar desde la raíz del backend:
 *   npx tsx src/seed-test-data.ts
 */
import { prisma } from './config/prismaClient.js';
function pad(n) { return String(n).padStart(2, '0'); }
function addMin(timeStr, mins) {
    const [h, m] = timeStr.split(':').map(Number);
    const total = h * 60 + m + mins;
    return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}
function ecToUTC(dateStr, timeStr) {
    const [y, mo, d] = dateStr.split('-').map(Number);
    const [hh, mm] = timeStr.split(':').map(Number);
    return new Date(Date.UTC(y, mo - 1, d, hh + 5, mm, 0));
}
function today() {
    const now = new Date(Date.now() - 5 * 3600000);
    return now.toISOString().slice(0, 10);
}
async function run() {
    const HOY = today();
    const [y, m] = HOY.split('-').map(Number);
    const dd = Number(HOY.slice(8));
    const QUINCENA_INICIO = dd <= 15 ? `${HOY.slice(0, 7)}-01` : `${HOY.slice(0, 7)}-16`;
    const QUINCENA_FIN = dd <= 15 ? `${HOY.slice(0, 7)}-15` : `${HOY.slice(0, 7)}-${pad(new Date(y, m, 0).getDate())}`;
    console.log(`\n🗓 HOY: ${HOY}  |  Quincena: ${QUINCENA_INICIO} → ${QUINCENA_FIN}\n`);
    const config = await prisma.configuracion.findUnique({ where: { id: 'default' } });
    const horarios = config?.horariosLaborales || {};
    const semana = horarios.semana || {};
    const entradaHora = semana.entrada || '08:00';
    const salidaHora = semana.salida || '17:30';
    const almInicioHora = semana.inicioAlmuerzo || '13:00';
    const tolerancia = Number(horarios.toleranciaMinutos ?? 8);
    console.log(`⏰ Config: Entrada=${entradaHora}  Salida=${salidaHora}  Tolerancia=${tolerancia}min\n`);
    const empleados = await prisma.empleado.findMany({
        select: { id: true, nombre: true, sueldoDiario: true, tipoContrato: true },
    });
    const empFijo = empleados.find(e => e.tipoContrato !== 'Eventual' && Number(e.sueldoDiario) > 0);
    if (!empFijo)
        throw new Error('No hay empleados fijos con sueldo');
    console.log(`👤 ${empFijo.nombre} (${empFijo.id})\n`);
    const empId = empFijo.id;
    // Limpiar hoy
    const startHoy = new Date(`${HOY}T00:00:00.000-05:00`);
    const endHoy = new Date(`${HOY}T23:59:59.999-05:00`);
    const del = await prisma.asistencia.deleteMany({
        where: { empleadoId: empId, fechaHora: { gte: startHoy, lte: endHoy } },
    });
    console.log(`🗑  Marcaciones eliminadas: ${del.count}`);
    // Tiempos de prueba
    const entradaTest = addMin(entradaHora, tolerancia + 12); // +12 sobre tolerancia → $3.00
    const almFinTest = addMin(almInicioHora, 60 + tolerancia + 5); // +5min sobre tolerancia de almuerzo → $2.00
    const salidaTest = addMin(salidaHora, 95); // 1h35m tarde → horas extras automáticas
    console.log('\n📝 ESCENARIO:');
    console.log(`   ENTRADA:      ${entradaTest}  (+${tolerancia + 12}min → esperado $3.00)`);
    console.log(`   INICIO_ALM:   ${almInicioHora}`);
    console.log(`   FIN_ALM:      ${almFinTest}  (dur: ${60 + tolerancia + 5}min → esperado $2.00)`);
    console.log(`   SALIDA:       ${salidaTest}  (95min tarde → HoraExtra automática)\n`);
    const created = [];
    for (const [tipo, label, hora] of [
        ['ENTRADA', 'Entrada', entradaTest],
        ['INICIO_ALMUERZO', 'Inicio Almuerzo', almInicioHora],
        ['FIN_ALMUERZO', 'Fin Almuerzo', almFinTest],
        ['SALIDA', 'Salida', salidaTest],
    ]) {
        const rec = await prisma.asistencia.create({
            data: { empleadoId: empId, tipo, label, fechaHora: ecToUTC(HOY, hora), ubicacionLat: null, ubicacionLng: null },
        });
        console.log(`   ✅ ${tipo.padEnd(18)} ${hora}`);
        created.push({ ...rec, tipo });
    }
    // HoraExtra de prueba
    const diffMs = ecToUTC(HOY, salidaTest).getTime() - ecToUTC(HOY, salidaHora).getTime();
    const horasExtra = Math.round((diffMs / 3600000) * 100) / 100;
    const totalHE = Math.round(horasExtra * 2.5 * 100) / 100;
    const fechaDia = ecToUTC(HOY, '00:00');
    await prisma.horaExtra.deleteMany({ where: { colaboradorId: empId, fecha: fechaDia } });
    const he = await prisma.horaExtra.create({
        data: {
            fecha: fechaDia,
            colaboradorId: empId,
            horas: horasExtra,
            detalleHorario: `${salidaHora} - ${salidaTest}`,
            descripcion: 'TEST: Horas extras por salida tarde',
            valorPorHora: 2.5,
            total: totalHE,
            estado: 'DEUDOR',
            aprobacionEstado: 'PENDIENTE',
            origen: 'ASISTENCIA',
        },
    });
    console.log(`\n   ✅ HoraExtra PENDIENTE: ${horasExtra}h = $${totalHE}  id:${he.id.slice(-8)}`);
    // Multas
    function calcMulta(mins, tol) {
        if (mins <= tol)
            return 0;
        const s = mins - tol;
        if (s <= 8)
            return 2;
        if (s <= 16)
            return 3;
        return 4;
    }
    const multaEnt = calcMulta(tolerancia + 12, tolerancia); // $3
    const multaAlm = calcMulta(tolerancia + 5, tolerancia); // $2
    const totalMul = multaEnt + multaAlm;
    const periodoInicio = new Date(`${QUINCENA_INICIO}T00:00:00.000Z`);
    const periodoFin = new Date(`${QUINCENA_FIN}T00:00:00.000Z`);
    const nom = await prisma.nominaRegistro.findFirst({
        where: { empleadoId: empId, fechaInicio: periodoInicio, fechaFin: periodoFin },
    });
    const entRec = created.find(c => c.tipo === 'ENTRADA');
    const almRec = created.find(c => c.tipo === 'FIN_ALMUERZO');
    const detalle = [
        { id: `qr-ent-${entRec?.id}`, fecha: HOY, horaMarcacion: entradaTest, horas: multaEnt,
            multaDolares: multaEnt, atrasoMinutos: tolerancia + 12,
            motivo: `Atraso entrada QR ${entradaTest} (+${tolerancia + 12} min)`, tipo: 'ATRASO_QR' },
        { id: `qr-alm-${almRec?.id}`, fecha: HOY, horaMarcacion: almFinTest, horas: multaAlm,
            multaDolares: multaAlm, atrasoMinutos: tolerancia + 5,
            motivo: `Atraso reg. almuerzo QR ${almFinTest} (+${tolerancia + 5} min)`, tipo: 'ATRASO_QR_ALMUERZO' },
    ];
    if (nom) {
        const eg = typeof nom.egresos === 'string' ? JSON.parse(nom.egresos) : (nom.egresos || {});
        const prevDet = Array.isArray(eg.permisosDetalle)
            ? eg.permisosDetalle.filter((p) => p.fecha !== HOY || !['ATRASO_QR', 'ATRASO_QR_ALMUERZO'].includes(p.tipo))
            : [];
        const newDet = [...prevDet, ...detalle];
        const newTotal = newDet.filter((r) => !r.eliminado).reduce((s, r) => s + (r.multaDolares ?? r.horas ?? 0), 0);
        await prisma.nominaRegistro.update({
            where: { id: nom.id },
            data: { diasLaborados: nom.diasLaborados + 1, permisoHoras: newTotal, egresos: { ...eg, permisosDetalle: newDet } },
        });
        console.log(`\n   ✅ Nómina actualizada: diasLaborados=${nom.diasLaborados + 1} | permisoHoras=$${newTotal}`);
    }
    else {
        const defaultEgr = { extensionConyuge: 0, prestamoQuirografario: 0, anticipos: 0,
            multas: 0, dctoFiesta: 0, dctoHerramientas: 0, dctoGenerico: 0, permisosDetalle: detalle };
        await prisma.nominaRegistro.create({
            data: { empleadoId: empId, fechaInicio: periodoInicio, fechaFin: periodoFin,
                diasLaborables: 15, diasLaborados: 1, permisoHoras: totalMul,
                ingresos: { horasExtras: 0, trabajosEnEmpresa: 0, fondosReserva: 0 },
                egresos: defaultEgr, abonos: [], estado: 'PENDIENTE' },
        });
        console.log(`\n   ✅ Nómina creada: diasLaborados=1 | permisoHoras=$${totalMul}`);
    }
    console.log('\n══════════════════════════════════════════════════════════════');
    console.log(`  ✅ Multa entrada:   $${multaEnt}  (atraso ${tolerancia + 12}min)`);
    console.log(`  ✅ Multa almuerzo:  $${multaAlm}  (atraso ${tolerancia + 5}min)`);
    console.log(`  ✅ Total descuento: $${totalMul}  → col Permisos/Horas`);
    console.log(`  ✅ HoraExtra:       ${horasExtra}h = $${totalHE}  [PENDIENTE]`);
    console.log('\n  👉 Nómina → 1ra Quincena Jul 2026 → Permisos/Horas = $' + totalMul);
    console.log('  👉 Nómina → Horas Extras → Aprueba id:' + he.id.slice(-8) + ' → suma en Ingresos');
    console.log('══════════════════════════════════════════════════════════════\n');
    await prisma.$disconnect();
}
run().catch(async (e) => { console.error('\n❌', e); await prisma.$disconnect(); process.exit(1); });
