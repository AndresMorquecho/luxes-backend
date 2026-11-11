import { prisma } from '../../config/prismaClient.js';

export async function assertActiveEmployees(ids: string[], existingIds: string[] = []) {
  const added = [...new Set(ids)].filter(id => !existingIds.includes(id));
  if (!added.length) return;
  const count = await prisma.empleado.count({ where: { id: { in: added }, archivedAt: null } });
  if (count !== added.length) throw new Error('Solo se pueden asignar colaboradores vigentes');
}

export async function assertActiveUsers(ids: string[], existingIds: string[] = []) {
  const added = [...new Set(ids)].filter(id => !existingIds.includes(id));
  if (!added.length) return;
  const count = await prisma.user.count({ where: { id: { in: added }, archivedAt: null, estado: 'activo' } });
  if (count !== added.length) throw new Error('Solo se pueden asignar usuarios activos que no estén dados de baja');
}
