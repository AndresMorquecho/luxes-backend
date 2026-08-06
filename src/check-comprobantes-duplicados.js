import { PrismaClient } from '@prisma/client';

process.env.DATABASE_URL = 'postgresql://luxes:LuxesProdSecurePass2026@31.97.40.14:5432/luxes_prod';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

async function verificarComprobantesDuplicados() {
  console.log('=====================================================');
  console.log('🔍 VERIFICANDO SI LOS ABONOS DUPLICADOS TIENEN COMPROBANTES / IMÁGENES');
  console.log('=====================================================\n');

  const duplicateGastoIds = [
    'GTO-temp-1786025429346',
    'GTO-temp-1785963173455',
  ];

  const targetNominaIds = [
    'b973e749-392a-4ac0-940c-f9f47d312e87', // Dixon 2da quincena
    'cb8593a3-e9c9-4e84-b84c-0ca31e7cc1c6', // Jefferson 2da quincena
  ];

  for (const nomId of targetNominaIds) {
    const nomina = await prisma.nominaRegistro.findUnique({
      where: { id: nomId },
      include: { empleado: { select: { nombre: true } } },
    });
    if (nomina) {
      const abonosRaw = nomina.abonos;
      const abonos = Array.isArray(abonosRaw) ? abonosRaw : (typeof abonosRaw === 'string' ? JSON.parse(abonosRaw) : []);
      console.log(`📋 Empleado: ${nomina.empleado?.nombre} (2da Quincena ID: ${nomId})`);
      abonos.forEach((a) => {
        const esDuplicado = duplicateGastoIds.includes(a.id);
        console.log(
          `  Abono ID: "${a.id}" | ${esDuplicado ? '⚠️ DUPLICADO ERRÓNEO' : '✅ VÁLIDO'} | Monto: $${a.monto} | Comprobante URL: "${a.comprobanteUrl || 'NINGUNO'}"`
        );
      });
    }
  }

  console.log('\n=====================================================\n');
}

verificarComprobantesDuplicados()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
