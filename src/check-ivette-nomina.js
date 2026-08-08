import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const nominas = await prisma.nominaRegistro.findMany({
    where: { empleadoId: 'EMP-001' }
  });
  console.log('=== NOMINAS IVETTE (EMP-001) ===');
  console.log(JSON.stringify(nominas, null, 2));

  const asistencias = await prisma.asistencia.findMany({
    where: { empleadoId: 'EMP-001' },
    orderBy: { fechaHora: 'desc' }
  });
  console.log('=== ASISTENCIAS IVETTE ===');
  console.log(JSON.stringify(asistencias.slice(0, 5), null, 2));

  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  prisma.$disconnect();
});
