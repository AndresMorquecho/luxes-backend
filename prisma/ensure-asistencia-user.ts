/**
 * Crea o actualiza el usuario de kiosco de asistencia sin borrar otros datos.
 * Uso en producción: npm run db:ensure-asistencia
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const USERNAME = 'asistencia';
const PASSWORD = '123456';

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  await prisma.user.upsert({
    where: { username: USERNAME },
    update: {
      nombre: 'Asistencia Kiosco',
      email: 'asistencia@luxes.com',
      rol: 'asistencia',
      roleId: null,
      estado: 'activo',
      passwordHash,
    },
    create: {
      id: 'USR-ASIS-001',
      nombre: 'Asistencia Kiosco',
      email: 'asistencia@luxes.com',
      username: USERNAME,
      rol: 'asistencia',
      roleId: null,
      estado: 'activo',
      passwordHash,
    },
  });

  console.log('✓ Usuario de asistencia listo');
  console.log(`  Usuario: ${USERNAME}`);
  console.log(`  Contraseña: ${PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
