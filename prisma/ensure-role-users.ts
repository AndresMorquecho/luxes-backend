import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const PASSWORD = 'luxes2026';

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const trabajadorRole = await prisma.role.findFirst({
    where: { name: 'Trabajador' },
  });

  const users = [
    {
      id: 'USR-TRAB-001',
      nombre: 'Trabajador Operativo',
      email: 'trabajador@luxes.com',
      username: 'trabajador',
      rol: 'Trabajador',
      roleId: trabajadorRole?.id ?? null,
      empleadoId: 'EMP-TRAB-001',
    },
  ];

  const empleados = [
    {
      id: 'EMP-TRAB-001',
      nombre: 'Trabajador Operativo',
      cedula: '0999999991',
      correo: 'trabajador@luxes.com',
    },
  ];

  for (const emp of empleados) {
    await prisma.empleado.upsert({
      where: { id: emp.id },
      update: emp,
      create: { ...emp, passwordHash },
    });
  }

  for (const user of users) {
    await prisma.user.upsert({
      where: { username: user.username },
      update: {
        nombre: user.nombre,
        email: user.email,
        rol: user.rol,
        roleId: user.roleId,
        passwordHash,
        estado: 'activo',
        empleadoId: user.empleadoId,
      },
      create: {
        ...user,
        passwordHash,
        estado: 'activo',
      },
    });
    console.log(`✓ Usuario ${user.username} (${user.rol}) listo`);
  }

  console.log('\n--- Credenciales de acceso ---');
  console.log('Contraseña para todos: luxes2026\n');
  for (const user of users) {
    console.log(`${user.rol.padEnd(22)} | usuario: ${user.username.padEnd(12)} | email: ${user.email}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
