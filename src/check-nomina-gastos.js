import { PrismaClient } from '@prisma/client';

process.env.DATABASE_URL = 'postgresql://luxes:LuxesProdSecurePass2026@31.97.40.14:5432/luxes_prod';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

async function auditarGastosNomina() {
  console.log('=====================================================');
  console.log('🔍 AUDITANDO REGISTROS DE NÓMINA Y GASTOS EN PROD');
  console.log('=====================================================\n');

  const nominas = await prisma.nominaRegistro.findMany({
    include: { empleado: { select: { nombre: true } } },
  });

  console.log(`📋 Nóminas con abonos registrados (${nominas.length} registros de nómina):\n`);
  for (const n of nominas) {
    const abonosRaw = n.abonos;
    const abonos = Array.isArray(abonosRaw) ? abonosRaw : (typeof abonosRaw === 'string' ? JSON.parse(abonosRaw) : []);
    if (abonos.length > 0) {
      console.log(`  Empleado: ${n.empleado?.nombre} (ID Nomina: ${n.id})`);
      abonos.forEach((a, i) => {
        console.log(`    Abono #${i + 1}: ID="${a.id}", Monto=$${a.monto}, Fecha="${a.fecha}", Metodo="${a.metodoPagoNombre || a.metodoPagoId}"`);
      });
    }
  }

  const gastosNomina = await prisma.gasto.findMany({
    where: {
      OR: [
        { categoria: 'nomina' },
        { concepto: { contains: 'Nómina', mode: 'insensitive' } },
        { concepto: { contains: 'Abono a Empleado', mode: 'insensitive' } },
      ],
    },
    include: { registradoPor: { select: { nombre: true } }, metodoPago: true },
    orderBy: { fecha: 'desc' },
  });

  console.log(`\n📋 Registros en tabla GASTO relacionados a Nómina (${gastosNomina.length} encontrados):\n`);
  gastosNomina.forEach((g) => {
    console.log(
      `  Gasto ID: ${g.id} | Concepto: "${g.concepto}" | Monto: $${g.monto} | Fecha: ${g.fecha.toISOString()} | Registrado por: ${g.registradoPor?.nombre || 'N/A'} | Método: ${g.metodoPago?.nombre || g.metodoPagoId || 'N/A'}`
    );
  });

  console.log('\n=====================================================\n');
}

auditarGastosNomina()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
