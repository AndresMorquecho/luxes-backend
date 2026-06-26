import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const PASSWORD = 'luxes2026';

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const impresionRole = await prisma.role.findFirst({
    where: { name: { in: ['Impresión', 'Impresion'] } },
  });
  const tallerRole = await prisma.role.findFirst({
    where: { name: 'Taller' },
  });
  const disenadorRole = await prisma.role.findFirst({
    where: { name: { in: ['Ventas / Diseñador', 'Diseñador'] } },
  });

  const users = [
    {
      id: 'USR-003',
      nombre: 'Impresor Principal',
      email: 'impresion@luxes.com',
      username: 'impresion',
      rol: 'Impresión',
      roleId: impresionRole?.id ?? null,
      empleadoId: 'EMP-003',
    },
    {
      id: 'USR-TALLER-001',
      nombre: 'Taller Técnico',
      email: 'taller@luxes.com',
      username: 'taller',
      rol: 'Taller',
      roleId: tallerRole?.id ?? null,
      empleadoId: 'EMP-TALLER-001',
    },
    {
      id: 'USR-005',
      nombre: 'Diseñador Creativo',
      email: 'disenador@luxes.com',
      username: 'disenador',
      rol: 'Ventas / Diseñador',
      roleId: disenadorRole?.id ?? null,
      empleadoId: 'EMP-005',
    },
  ];

  const empleados = [
    {
      id: 'EMP-003',
      nombre: 'Impresor Principal',
      cedula: '0999999993',
      cargo: 'Impresor',
      departamento: 'Producción',
      correo: 'impresion@luxes.com',
    },
    {
      id: 'EMP-TALLER-001',
      nombre: 'Taller Técnico',
      cedula: '0999999997',
      cargo: 'Técnico de Taller',
      departamento: 'Taller',
      correo: 'taller@luxes.com',
    },
    {
      id: 'EMP-005',
      nombre: 'Diseñador Creativo',
      cedula: '0999999995',
      cargo: 'Diseñador',
      departamento: 'Diseño',
      correo: 'disenador@luxes.com',
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
