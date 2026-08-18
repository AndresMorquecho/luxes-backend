import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const targetUsernames = ['ventas', 'taller', 'impresion', 'disenador'];
  
  console.log('Buscando usuarios a eliminar:', targetUsernames);
  const found = await prisma.user.findMany({
    where: { username: { in: targetUsernames } }
  });
  console.log('Usuarios encontrados:', found.map(u => ({ id: u.id, username: u.username, rol: u.rol })));

  const result = await prisma.user.deleteMany({
    where: { username: { in: targetUsernames } }
  });

  console.log(`✓ Eliminados ${result.count} usuarios (${targetUsernames.join(', ')}).`);

  const remaining = await prisma.user.findMany({
    select: { id: true, username: true, nombre: true, rol: true, estado: true },
    orderBy: { rol: 'asc' }
  });

  console.log('\n=== USUARIOS ACTIVOS RESTANTES ===');
  console.table(remaining);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
