import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const PASSWORD = '123456';

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const ventasRole = await prisma.role.findFirst({
    where: { name: { in: ['Ventas', 'Ventas / Diseñador'] } },
  });

  const empleadoId = 'EMP-VENTAS-DEV';
  const userId = 'USR-VENTAS-DEV';

  await prisma.empleado.upsert({
    where: { id: empleadoId },
    update: {
      nombre: 'Usuario Ventas Demo',
      correo: 'ventas.demo@luxes.com',
      passwordHash,
    },
    create: {
      id: empleadoId,
      nombre: 'Usuario Ventas Demo',
      cedula: '0999999901',
      correo: 'ventas.demo@luxes.com',
      telefono: '0987654321',
      tipoContrato: 'Fijo',
      tieneContrato: true,
      region: 'costa',
      passwordHash,
    },
  });

  await prisma.user.upsert({
    where: { username: 'ventas.demo' },
    update: {
      nombre: 'Usuario Ventas Demo',
      email: 'ventas.demo@luxes.com',
      rol: 'Ventas',
      roleId: ventasRole?.id ?? null,
      passwordHash,
      estado: 'activo',
      empleadoId,
    },
    create: {
      id: userId,
      nombre: 'Usuario Ventas Demo',
      email: 'ventas.demo@luxes.com',
      username: 'ventas.demo',
      rol: 'Ventas',
      roleId: ventasRole?.id ?? null,
      passwordHash,
      estado: 'activo',
      empleadoId,
    },
  });

  console.log('\n--- Usuario Ventas creado/actualizado ---');
  console.log('Usuario:   ventas.demo');
  console.log('Contraseña: 123456');
  console.log('Email:     ventas.demo@luxes.com');
  console.log('Rol:       Ventas');
  console.log('RoleId:   ', ventasRole?.id ?? '(sin rol en BD — ejecuta seed si falta)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
