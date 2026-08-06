import { PrismaClient } from '@prisma/client';

process.env.DATABASE_URL = 'postgresql://luxes:LuxesProdSecurePass2026@31.97.40.14:5432/luxes_prod';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

async function limpiarDuplicadosNomina() {
  console.log('=====================================================');
  console.log('🧹 LIMPIANDO REGISTROS DUPLICADOS DE NÓMINA EN PROD');
  console.log('=====================================================\n');

  // IDs de los abonos duplicados erróneos de 2da quincena
  const duplicateGastoIds = [
    'GTO-temp-1786025429347', // Dixon 2da quincena duplicado
    'GTO-temp-1785963173455', // Jefferson 2da quincena duplicado
  ];

  for (const gastoId of duplicateGastoIds) {
    const existing = await prisma.gasto.findUnique({ where: { id: gastoId } });
    if (existing) {
      await prisma.gasto.delete({ where: { id: gastoId } });
      console.log(`  ✅ Eliminado registro de gasto duplicado: ${gastoId} ($${existing.monto})`);
    } else {
      console.log(`  ℹ️ Registro de gasto ${gastoId} no encontrado o ya eliminado.`);
    }
  }

  // Limpiar los abonos de 2da quincena en la tabla nominaRegistro
  const targetNominaIds = [
    'b973e749-392a-4ac0-940c-f9f47d312e87', // Dixon 2da quincena
    'cb8593a3-e9c9-4e84-b84c-0ca31e7cc1c6', // Jefferson 2da quincena
  ];

  for (const nomId of targetNominaIds) {
    const nomina = await prisma.nominaRegistro.findUnique({ where: { id: nomId } });
    if (nomina) {
      const abonosRaw = nomina.abonos;
      const abonos = Array.isArray(abonosRaw) ? abonosRaw : (typeof abonosRaw === 'string' ? JSON.parse(abonosRaw) : []);
      const abonosFiltrados = abonos.filter((a) => !duplicateGastoIds.includes(a.id));

      const nuevoEstado = abonosFiltrados.length === 0 ? 'PENDIENTE' : 'ABONO_PARCIAL';

      await prisma.nominaRegistro.update({
        where: { id: nomId },
        data: {
          abonos: abonosFiltrados,
          estado: nuevoEstado,
        },
      });

      console.log(`  ✅ Limpiados abonos en nómina de 2da quincena ID: ${nomId} (Nuevo estado: ${nuevoEstado})`);
    }
  }

  console.log('\n=====================================================');
  console.log('✅ LIMPIEZA FINALIZADA CON ÉXITO');
  console.log('=====================================================\n');
}

limpiarDuplicadosNomina()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
