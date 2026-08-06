import { PrismaClient } from '@prisma/client';

process.env.DATABASE_URL = 'postgresql://luxes:LuxesProdSecurePass2026@31.97.40.14:5432/luxes_prod';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

async function verificarAmbasQuincenas() {
  console.log('=====================================================');
  console.log('🔍 VERIFICANDO COMPROBANTES EN AMBAS QUINCENAS');
  console.log('=====================================================\n');

  const nominas = await prisma.nominaRegistro.findMany({
    where: {
      OR: [
        { id: 'a2cb741d-2f65-47f8-b89a-6af4392f5563' }, // Dixon 1era
        { id: 'b973e749-392a-4ac0-940c-f9f47d312e87' }, // Dixon 2da
        { id: 'aff5901f-cedf-4429-a2b0-314b51fdea24' }, // Jefferson 1era
        { id: 'cb8593a3-e9c9-4e84-b84c-0ca31e7cc1c6' }, // Jefferson 2da
      ],
    },
    include: { empleado: { select: { nombre: true } } },
    orderBy: { fechaInicio: 'asc' },
  });

  nominas.forEach((n) => {
    const abonosRaw = n.abonos;
    const abonos = Array.isArray(abonosRaw) ? abonosRaw : (typeof abonosRaw === 'string' ? JSON.parse(abonosRaw) : []);
    const qLabel = n.fechaInicio.toISOString().includes('01T') ? '1era Quincena (VÁLIDA)' : '2da Quincena (DUPLICADA)';
    console.log(`📋 Empleado: ${n.empleado?.nombre} | ${qLabel}`);
    abonos.forEach((a) => {
      console.log(`    Abono ID: "${a.id}" | Monto: $${a.monto} | Comprobante: "${a.comprobanteUrl || 'NINGUNO'}"`);
    });
  });

  console.log('\n=====================================================\n');
}

verificarAmbasQuincenas()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
