import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const users = await prisma.user.findMany({ select: { username: true, rol: true, id: true, estado: true } });
  console.log(users);
}
main().finally(() => prisma.$disconnect());
