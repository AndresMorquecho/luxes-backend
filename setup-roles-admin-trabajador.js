// setup-roles-admin-trabajador.js
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('--- CONFIGURANDO ROLES: ADMINISTRADOR Y TRABAJADOR ---');

  // 1. Asegurar Permisos
  const allPermissions = await prisma.permission.findMany();
  const permMap = new Map(allPermissions.map((p) => [p.key, p.id]));

  // 2. Crear / Asegurar Rol Administrador
  let adminRole = await prisma.role.findUnique({ where: { name: 'Administrador' } });
  if (!adminRole) {
    adminRole = await prisma.role.create({
      data: {
        name: 'Administrador',
        description: 'Control total y administración general del sistema',
      },
    });
  }

  // Asignar todos los permisos al Administrador
  for (const perm of allPermissions) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: adminRole.id,
          permissionId: perm.id,
        },
      },
      update: {},
      create: {
        roleId: adminRole.id,
        permissionId: perm.id,
      },
    });
  }

  // 3. Crear / Asegurar Rol Trabajador
  let trabajadorRole = await prisma.role.findUnique({ where: { name: 'Trabajador' } });
  if (!trabajadorRole) {
    trabajadorRole = await prisma.role.create({
      data: {
        name: 'Trabajador',
        description: 'Acceso operativo: tareas, asistencia, compras y gestión de proyectos',
      },
    });
  }

  // Permisos para el Trabajador: Tareas, Asistencia, Compras (aprobación y pedidos), Proyectos
  const trabajadorPermKeys = [
    'gestion_tareas',
    'pedidos',
    'recepcion_pedidos',
    'aprobacion_ordenes_compra',
    'inventario',
    'abonos'
  ];

  for (const key of trabajadorPermKeys) {
    const permId = permMap.get(key);
    if (permId) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: trabajadorRole.id,
            permissionId: permId,
          },
        },
        update: {},
        create: {
          roleId: trabajadorRole.id,
          permissionId: permId,
        },
      });
    }
  }

  // 4. Actualizar todos los usuarios no administradores a 'Trabajador'
  const nonAdminUsers = await prisma.user.findMany({
    where: {
      NOT: {
        OR: [
          { username: 'admin' },
          { rol: 'Administrador' },
        ],
      },
    },
  });

  for (const user of nonAdminUsers) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        rol: 'Trabajador',
        roleId: trabajadorRole.id,
      },
    });
    console.log(`Usuario ${user.username} asignado al rol Trabajador`);
  }

  // 5. Crear usuario de prueba 'trabajador' si no existe
  const passwordHash = await bcrypt.hash('123456', 10);
  const existingTrabajador = await prisma.user.findFirst({
    where: { username: 'trabajador' },
  });

  if (!existingTrabajador) {
    await prisma.user.create({
      data: {
        id: 'USR-TRABAJADOR-DEMO',
        nombre: 'Usuario Trabajador',
        username: 'trabajador',
        email: 'trabajador@luxes.com',
        passwordHash: passwordHash,
        rol: 'Trabajador',
        roleId: trabajadorRole.id,
        estado: 'activo',
      },
    });
    console.log('Creado usuario demo: trabajador / 123456');
  } else {
    await prisma.user.update({
      where: { id: existingTrabajador.id },
      data: {
        passwordHash: passwordHash,
        rol: 'Trabajador',
        roleId: trabajadorRole.id,
      },
    });
    console.log('Actualizado usuario demo: trabajador / 123456');
  }

  // 6. Eliminar roles antiguos que ya no se usan (Taller, Ventas, Impresión, Diseñador)
  const obsoleteRoles = ['Taller', 'Ventas', 'Impresión', 'Impresion', 'Diseñador', 'Disenador', 'Ventas / Diseñador'];
  for (const roleName of obsoleteRoles) {
    const r = await prisma.role.findUnique({ where: { name: roleName } });
    if (r) {
      // Desvincular usuarios
      await prisma.user.updateMany({
        where: { roleId: r.id },
        data: { roleId: trabajadorRole.id, rol: 'Trabajador' },
      });
      // Eliminar permisos vinculados
      await prisma.rolePermission.deleteMany({
        where: { roleId: r.id },
      });
      // Eliminar el rol
      await prisma.role.delete({
        where: { id: r.id },
      });
      console.log(`Rol obsoleto eliminado: ${roleName}`);
    }
  }

  console.log('--- ROLES Y USUARIOS CONFIGURADOS CON ÉXITO ---');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
