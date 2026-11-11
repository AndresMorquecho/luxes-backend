import { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../../config/prismaClient.js';

export type ArchiveInput = {
  userId?: string;
  empleadoId?: string;
  fechaBaja?: string;
  motivo?: string;
  actor?: { id?: string; nombre?: string; email?: string };
};

export function archiveDate(value?: string, now = new Date()): Date {
  const date = value || new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil' }).format(now);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Fecha de baja inválida');
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw new Error('Fecha de baja inválida');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil' }).format(now);
  if (date > today) throw new Error('La fecha de baja no puede ser futura');
  return parsed;
}

/** One reversible, atomic operation for both DELETE entry points. Never delete identities or history. */
export async function archiveEmployee(input: ArchiveInput, db: PrismaClient | Prisma.TransactionClient = prisma) {
  const fechaBaja = archiveDate(input.fechaBaja);
  if (!input.userId && !input.empleadoId) throw new Error('Identidad requerida');
  if (!input.actor?.id && !input.actor?.nombre) throw new Error('Se requiere el responsable de la baja');
  const motivo = String(input.motivo || 'Baja de la empresa').trim().slice(0, 500);
  const execute = async (tx: Prisma.TransactionClient) => {
    const user = input.userId
      ? await tx.user.findUnique({ where: { id: input.userId } })
      : await tx.user.findUnique({ where: { empleadoId: input.empleadoId } });
    const empleadoId = input.empleadoId || user?.empleadoId;
    const empleado = empleadoId ? await tx.empleado.findUnique({ where: { id: empleadoId } }) : null;
    if (input.userId && !user) throw new Error('Usuario no encontrado');
    if (input.empleadoId && !empleado) throw new Error('Empleado no encontrado');
    if (user?.id === input.actor!.id) throw new Error('No puedes dar de baja tu propia cuenta');
    if (user && ['admin', 'asistencia', 'taller'].includes(user.username.toLowerCase())) {
      throw new Error('Esta cuenta de sistema no se puede dar de baja');
    }
    if (user?.archivedAt && (!empleado || empleado.archivedAt)) {
      return { userId: user.id, empleadoId: empleado?.id || null, archivedAt: user.archivedAt, fechaBaja: empleado?.fechaBaja || null, alreadyArchived: true };
    }
    if (!user && empleado?.archivedAt) {
      return { userId: null, empleadoId: empleado.id, archivedAt: empleado.archivedAt, fechaBaja: empleado.fechaBaja, alreadyArchived: true };
    }
    const now = new Date();
    if (user) await tx.user.update({ where: { id: user.id }, data: { estado: 'inactivo', archivedAt: now } });
    if (empleado) await tx.empleado.update({ where: { id: empleado.id }, data: { archivedAt: now, fechaBaja, autoAsistencia: false } });
    await tx.auditLog.create({ data: {
      userId: input.actor!.id || null,
      usuarioNom: input.actor!.nombre || input.actor!.email || 'Administrador',
      accion: 'Dar de baja', modulo: 'Usuarios y Empleados', severidad: 'Critico',
      detalle: JSON.stringify({ nombre: empleado?.nombre || user?.nombre, userId: user?.id || null, empleadoId: empleado?.id || null, fechaBaja: fechaBaja.toISOString().slice(0, 10), motivo, historialConservado: true }),
    } });
    return { userId: user?.id || null, empleadoId: empleado?.id || null, archivedAt: now, fechaBaja, alreadyArchived: false };
  };
  return '$transaction' in db
    ? db.$transaction(execute, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10000 })
    : execute(db);
}
