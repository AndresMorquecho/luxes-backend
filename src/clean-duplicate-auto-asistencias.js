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

async function limpiarDuplicadosAutoAsistencia() {
  console.log('=====================================================');
  console.log('🧹 LIMPIEZA DE MARCACIONES DUPLICADAS DE AUTO-ASISTENCIA');
  console.log('=====================================================\n');

  try {
    // Buscar todos los empleados con autoAsistencia activado
    const emps = await prisma.empleado.findMany({
      where: { autoAsistencia: true },
      select: { id: true, nombre: true },
    });

    console.log(`👥 Evaluando ${emps.length} empleado(s) con Marcación Automática...\n`);

    let eliminadosTotal = 0;

    for (const emp of emps) {
      console.log(`👤 Empleado: ${emp.nombre} (${emp.id})`);
      const marcaciones = await prisma.asistencia.findMany({
        where: { empleadoId: emp.id },
        orderBy: { fechaHora: 'asc' },
      });

      // Agrupar por fecha y tipo
      const seen = new Set();
      const idsToDelete = [];

      for (const m of marcaciones) {
        const dateStr = m.fechaHora.toISOString().slice(0, 10);
        const key = `${dateStr}_${m.tipo}`;
        if (seen.has(key)) {
          idsToDelete.push(m.id);
        } else {
          seen.add(key);
        }
      }

      if (idsToDelete.length > 0) {
        console.log(`   ⚠️ Se encontraron ${idsToDelete.length} marcaciones duplicadas para eliminar:`);
        console.log(`   IDs: ${idsToDelete.join(', ')}`);

        const res = await prisma.asistencia.deleteMany({
          where: { id: { in: idsToDelete } },
        });
        console.log(`   ✅ Eliminadas ${res.count} marcaciones duplicadas con éxito.\n`);
        eliminadosTotal += res.count;
      } else {
        console.log(`   ✨ No se encontraron duplicados.\n`);
      }
    }

    console.log(`=====================================================`);
    console.log(`🎉 LIMPIEZA FINALIZADA: ${eliminadosTotal} marcaciones duplicadas eliminadas.`);
    console.log(`=====================================================\n`);
  } catch (err) {
    console.error('❌ Error durante la limpieza:', err);
  } finally {
    await prisma.$disconnect();
  }
}

limpiarDuplicadosAutoAsistencia();
