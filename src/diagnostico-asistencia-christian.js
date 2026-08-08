import { PrismaClient } from '@prisma/client';

const PROD_URL = 'postgresql://luxes:LuxesProdSecurePass2026@31.97.40.14:5432/luxes_prod';
const DATABASE_URL = (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost'))
  ? process.env.DATABASE_URL
  : PROD_URL;

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: DATABASE_URL,
    },
  },
});

async function main() {
  console.log('=====================================================');
  console.log('🔍 AUDITORÍA COMPLETA — VIERNES 7 DE AGOSTO DE 2026');
  console.log('=====================================================\n');

  try {
    const start = new Date('2026-08-07T05:00:00.000Z');
    const end = new Date('2026-08-08T05:00:00.000Z');

    const marcaciones = await prisma.asistencia.findMany({
      where: {
        fechaHora: { gte: start, lte: end },
      },
      orderBy: { fechaHora: 'asc' },
    });

    const emps = await prisma.empleado.findMany({
      select: { id: true, nombre: true }
    });
    const empMap = new Map(emps.map(e => [e.id, e.nombre]));

    console.log(`📋 Total de marcaciones encontradas el 7 de agosto: ${marcaciones.length}\n`);

    for (const m of marcaciones) {
      const ecTime = new Date(m.fechaHora.getTime() - 5 * 3600 * 1000).toISOString().substring(11, 19);
      const nombre = empMap.get(m.empleadoId) || 'Desconocido';
      console.log(`⏰ Hora EC: ${ecTime} | Empleado: ${nombre} (${m.empleadoId}) | Tipo: ${m.tipo} | ID: ${m.id}`);
    }

    console.log('\n-----------------------------------------------------');
    console.log('👥 EMPLEADOS REGISTRADOS');
    console.log('-----------------------------------------------------');

    for (const e of emps) {
      console.log(`👤 ID: ${e.id} | Nombre: ${e.nombre}`);
    }

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
