import { PrismaClient } from '@prisma/client';

process.env.DATABASE_URL = 'postgresql://luxes:LuxesProdSecurePass2026@31.97.40.14:5432/luxes_prod';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

async function registrarSalidaChristian() {
  console.log('=====================================================');
  console.log('🔒 REGISTRANDO SALIDA A LAS 17:30 PARA CHRISTIAN PAREDES (04/08/2026)');
  console.log('=====================================================\n');

  const empleadoId = 'EMP-002'; // CHRISTIAN MANUEL PAREDES ARMIJOS
  // 17:30 Ecuador = 22:30 UTC (04/08/2026)
  const dtSalidaUTC = new Date('2026-08-04T22:30:00.000Z');

  // Verificar si ya existe una marca de SALIDA para Christian el 04/08
  const inicioDia = new Date('2026-08-04T05:00:00.000Z');
  const finDia = new Date('2026-08-05T04:59:59.999Z');

  const existente = await prisma.asistencia.findFirst({
    where: {
      empleadoId,
      tipo: 'SALIDA',
      fechaHora: { gte: inicioDia, lte: finDia },
    },
  });

  if (existente) {
    console.log(`⚠️ Ya existe un registro de SALIDA para Christian Paredes el 04/08/2026 (ID: ${existente.id}).`);
  } else {
    const creada = await prisma.asistencia.create({
      data: {
        empleadoId,
        tipo: 'SALIDA',
        label: 'Salida Trabajo',
        fechaHora: dtSalidaUTC,
        ubicacionLat: -2.14,
        ubicacionLng: -79.60597,
      },
    });
    console.log(`✅ Registro de SALIDA creado con éxito para Christian Paredes! -> ID: ${creada.id}`);
  }

  console.log('\n=====================================================');
  console.log('✨ PROCESO FINALIZADO CON ÉXITO');
  console.log('=====================================================\n');
}

registrarSalidaChristian()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
