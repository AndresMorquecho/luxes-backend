import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('luxes2026', 10);
  
  await prisma.user.updateMany({
    data: { passwordHash }
  });
  
  console.log('Todos los passwords actualizados con exito!');
}

main().finally(() => prisma.$disconnect());
