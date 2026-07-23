/**
 * Asegura un usuario de desarrollo por cada rol con contraseña conocida.
 * Uso local: npx tsx prisma/ensure-dev-role-users.ts
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const PASSWORD = '123456';

const DEV_USERS = [
  {
    id: 'USR-DEV-ADMIN',
    username: 'admin',
    email: 'admin@luxes.com',
    nombre: 'Admin Dev',
    roleNames: ['Administrador', 'Admin'],
    rolFallback: 'Administrador',
  },
  {
    id: 'USR-DEV-VENTAS',
    username: 'ventas',
    email: 'ventas@luxes.com',
    nombre: 'Ventas Dev',
    roleNames: ['Ventas', 'Ventas / Diseñador'],
    rolFallback: 'Ventas',
  },
  {
    id: 'USR-DEV-DISENADOR',
    username: 'disenador',
    email: 'disenador@luxes.com',
    nombre: 'Diseñador Dev',
    roleNames: ['Diseñador', 'Ventas / Diseñador'],
    rolFallback: 'Diseñador',
  },
  {
    id: 'USR-DEV-IMPRESION',
    username: 'impresion',
    email: 'impresion@luxes.com',
    nombre: 'Impresión Dev',
    roleNames: ['Impresión', 'Impresion'],
    rolFallback: 'Impresión',
  },
  {
    id: 'USR-DEV-TALLER',
    username: 'taller',
    email: 'taller@luxes.com',
    nombre: 'Taller Dev',
    roleNames: ['Taller'],
    rolFallback: 'Taller',
  },
  {
    id: 'USR-DEV-ASISTENCIA',
    username: 'asistencia',
    email: 'asistencia@luxes.com',
    nombre: 'Asistencia Kiosco',
    roleNames: [],
    rolFallback: 'asistencia',
  },
] as const;

async function findRole(names: readonly string[]) {
  if (!names.length) return null;
  return prisma.role.findFirst({
    where: {
      OR: names.map((name) => ({
        name: { equals: name, mode: 'insensitive' as const },
      })),
    },
  });
}

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  console.log('Asegurando usuarios de desarrollo por rol...\n');

  for (const user of DEV_USERS) {
    const role = await findRole(user.roleNames);
    const rol = role?.name || user.rolFallback;

    await prisma.user.upsert({
      where: { username: user.username },
      update: {
        nombre: user.nombre,
        email: user.email,
        rol,
        roleId: role?.id ?? null,
        passwordHash,
        estado: 'activo',
      },
      create: {
        id: user.id,
        username: user.username,
        nombre: user.nombre,
        email: user.email,
        rol,
        roleId: role?.id ?? null,
        passwordHash,
        estado: 'activo',
      },
    });

    console.log(`✓ ${rol.padEnd(22)} | usuario: ${user.username}`);
  }

  // Alinear cuentas frecuentes en local (mismo password)
  const knownLocals = ['MorquechoI', 'ivettemorquecho', 'JimmyE', 'EdinsonM', 'ChristhianP'];
  let knownUpdated = 0;
  for (const username of knownLocals) {
    const result = await prisma.user.updateMany({
      where: { username: { equals: username, mode: 'insensitive' } },
      data: { passwordHash, estado: 'activo' },
    });
    knownUpdated += result.count;
  }

  if (knownUpdated > 0) {
    console.log(`\n✓ Contraseña actualizada también en ${knownUpdated} usuario(s) local(es) conocidos`);
  }

  console.log('\n--- Credenciales locales ---');
  console.log(`Contraseña para todos: ${PASSWORD}\n`);
  for (const user of DEV_USERS) {
    console.log(`${user.username.padEnd(12)} | ${user.email}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
