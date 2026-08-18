import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('=== Sincronizando contraseñas y usuarios ===');
  const passwordHash = await bcrypt.hash('123456', 10);

  // 1. Actualizar contraseña de TODOS los usuarios existentes a 123456
  const updatedUsers = await prisma.user.updateMany({
    data: {
      passwordHash: passwordHash,
      estado: 'activo'
    }
  });
  console.log(`✓ Se actualizaron las contraseñas de ${updatedUsers.count} usuarios a "123456".`);

  // 2. Obtener roles existentes
  const roles = await prisma.role.findMany();
  const roleMap = {};
  roles.forEach(r => {
    roleMap[r.name.toLowerCase()] = r.id;
  });

  // 3. Asegurar usuarios del sistema genéricos
  const systemUsers = [
    { username: 'admin', nombre: 'Administrador General', email: 'admin@luxes.com', rol: 'Administrador', roleName: 'administrador' },
    { username: 'ventas', nombre: 'Ventas General', email: 'ventas@luxes.com', rol: 'Ventas', roleName: 'ventas' },
    { username: 'taller', nombre: 'Taller Técnico', email: 'taller@luxes.com', rol: 'Taller', roleName: 'taller' },
    { username: 'impresion', nombre: 'Impresor Principal', email: 'impresion@luxes.com', rol: 'Impresión', roleName: 'impresión' },
    { username: 'disenador', nombre: 'Diseñador Creativo', email: 'disenador@luxes.com', rol: 'Diseñador', roleName: 'diseñador' },
    { username: 'asistencia', nombre: 'Asistencia Kiosco', email: 'asistencia@luxes.com', rol: 'asistencia', roleName: null },
  ];

  for (const su of systemUsers) {
    const roleId = su.roleName ? roleMap[su.roleName] : null;
    const existing = await prisma.user.findUnique({ where: { username: su.username } });
    if (!existing) {
      await prisma.user.create({
        data: {
          nombre: su.nombre,
          username: su.username,
          email: su.email,
          rol: su.rol,
          roleId: roleId || null,
          estado: 'activo',
          passwordHash: passwordHash
        }
      });
      console.log(`+ Creado usuario de sistema: ${su.username}`);
    } else {
      await prisma.user.update({
        where: { username: su.username },
        data: {
          rol: su.rol,
          roleId: roleId || existing.roleId,
          passwordHash: passwordHash,
          estado: 'activo'
        }
      });
      console.log(`* Actualizado usuario de sistema: ${su.username}`);
    }
  }

  // 4. Listar todos los usuarios disponibles
  const allUsers = await prisma.user.findMany({
    select: {
      id: true,
      username: true,
      nombre: true,
      rol: true,
      email: true,
      estado: true
    },
    orderBy: { rol: 'asc' }
  });

  console.log('\n=== LISTA DE USUARIOS ACTIVOS PARA INICIAR SESIÓN ===');
  console.table(allUsers.map(u => ({
    Usuario: u.username,
    Nombre: u.nombre,
    Rol: u.rol,
    Contraseña: '123456',
    Estado: u.estado
  })));
}

main()
  .catch((e) => {
    console.error('Error al sincronizar usuarios:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
