import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const roles = await prisma.role.findMany({
    include: { permissions: { include: { permission: true } } }
  });
  console.log('=== ROLES ===');
  console.log(roles.map(r => ({ id: r.id, name: r.name, perms: r.permissions.map(p => p.permission.key) })));
  
  const users = await prisma.user.findMany({
    select: { id: true, nombre: true, username: true, email: true, rol: true, roleId: true, estado: true }
  });
  console.log('=== USERS ===');
  console.log(users);
}
main().finally(() => prisma.$disconnect());
