import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const p = await prisma.proyecto.findFirst({
    where: { id: 'PROY-004' },
    include: { fases: true }
  });
  console.log("PROJECT PROY-004:", JSON.stringify(p, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
