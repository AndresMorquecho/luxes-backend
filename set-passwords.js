import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('luxes2026', 10);
  
  await prisma.user.updateMany({
    where: { username: { in: ['JimmyE', 'EdinsonM', 'ChristhianP'] } },
    data: { passwordHash }
  });
  
  console.log('Passwords updated successfully!');
}

main().finally(() => prisma.$disconnect());
