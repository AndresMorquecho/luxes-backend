import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function diagnostico() {
    console.log('=====================================================');
    console.log('🔍 INICIANDO DIAGNÓSTICO DE SOLO LECTURA EN BASE DE DATOS');
    console.log('=====================================================\n');
    // 1. Obtener Empleados
    const empleados = await prisma.empleado.findMany({
        select: { id: true, nombre: true, autoAsistencia: true, tipoContrato: true },
    });
    console.log(`📋 Empleados registrados (${empleados.length}):`);
    empleados.forEach((e) => console.log(`  - [${e.id}] ${e.nombre} | Contrato: ${e.tipoContrato} | AutoAsistencia: ${e.autoAsistencia}`));
    console.log('\n-----------------------------------------------------');
    console.log('📅 REGISTROS DE ASISTENCIA (Últimos 7 días)');
    console.log('-----------------------------------------------------');
    const asistencias = await prisma.asistencia.findMany({
        include: { empleado: { select: { nombre: true } } },
        orderBy: { fechaHora: 'desc' },
        take: 50,
    });
    if (asistencias.length === 0) {
        console.log('  (No hay marcaciones registradas)');
    }
    else {
        asistencias.forEach((a) => {
            const fechaUTC = new Date(a.fechaHora);
            // Convert UTC to Ecuador time string (UTC-5)
            const ecTimeStr = new Date(fechaUTC.getTime() - 5 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
            console.log(`  ID: ${a.id} | Empleado: ${a.empleado.nombre} | Tipo: ${a.tipo.padEnd(16)} | UTC: ${fechaUTC.toISOString()} | Ecuador: ${ecTimeStr}`);
        });
    }
    console.log('\n-----------------------------------------------------');
    console.log('⏰ REGISTROS DE HORAS EXTRAS (Planilla / Solicitudes)');
    console.log('-----------------------------------------------------');
    const horasExtras = await prisma.horaExtra.findMany({
        include: { colaborador: { select: { nombre: true } } },
        orderBy: { createdAt: 'desc' },
        take: 30,
    });
    if (horasExtras.length === 0) {
        console.log('  (No hay solicitudes de horas extras registradas)');
    }
    else {
        horasExtras.forEach((h) => {
            const fechaBaseStr = new Date(h.fecha).toISOString().split('T')[0];
            const createdUTC = new Date(h.createdAt);
            const createdEC = new Date(createdUTC.getTime() - 5 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
            console.log(`  ID: ${h.id} | Colaborador: ${h.colaborador.nombre} | FechaTabla: ${fechaBaseStr} | Horas: ${h.horas} | Horario: ${h.detalleHorario} | Estado: ${h.aprobacionEstado} | CreadoEC: ${createdEC}`);
        });
    }
    console.log('\n=====================================================');
    console.log('✅ DIAGNÓSTICO FINALIZADO');
    console.log('=====================================================\n');
}
diagnostico()
    .catch((err) => console.error('❌ Error en el diagnóstico:', err))
    .finally(() => prisma.$disconnect());
