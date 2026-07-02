/**
 * Inserta notificaciones de prueba para todos los roles.
 * No borra notificaciones existentes (append-only).
 *
 * Uso: npm run db:seed-notifications
 * Borrar previas de prueba y recrear: npm run db:seed-notifications -- --fresh
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const fresh = process.argv.includes('--fresh');
const SEED_MARKER = '[seed-prueba]';

type NotifInput = {
  title: string;
  message: string;
  rol?: string;
  permission?: string;
  userId?: string;
  createdBy?: string;
  createdAt?: Date;
  isRead?: boolean;
};

function hoursAgo(h: number): Date {
  return new Date(Date.now() - h * 60 * 60 * 1000);
}

async function main() {
  const admin = await prisma.user.findFirst({
    where: {
      OR: [
        { username: 'MorquechoI' },
        { username: 'admin' },
        { rol: { in: ['Administrador', 'admin', 'administrador'] } },
      ],
    },
    orderBy: { username: 'asc' },
  });
  const taller = await prisma.user.findFirst({
    where: { OR: [{ username: 'taller' }, { rol: 'Taller' }] },
  });
  const impresion = await prisma.user.findFirst({
    where: { OR: [{ username: 'impresion' }, { rol: 'Impresión' }] },
  });
  const ventas = await prisma.user.findFirst({
    where: {
      OR: [
        { username: 'ventas' },
        { username: 'MaybeO' },
        { rol: 'Ventas' },
      ],
    },
  });
  const disenador = await prisma.user.findFirst({
    where: {
      OR: [
        { username: 'disenador' },
        { username: 'JoseA' },
        { rol: { in: ['Diseñador', 'Ventas / Diseñador'] } },
      ],
    },
  });

  if (fresh) {
    const deleted = await prisma.notification.deleteMany({
      where: { message: { contains: SEED_MARKER } },
    });
    console.log(`Eliminadas ${deleted.count} notificaciones de prueba anteriores.`);
  }

  const roleNotifications: NotifInput[] = [
    {
      title: 'Nueva Orden de Compra',
      message: `${SEED_MARKER} Se ha generado la orden ORC-2026-042 por $1,250.00 pendiente de aprobación.`,
      rol: 'admin',
      permission: 'aprobacion_ordenes_compra',
      createdBy: 'JimmyE',
      createdAt: hoursAgo(2),
    },
    {
      title: 'Nuevo Proyecto con Instalación',
      message: `${SEED_MARKER} Se ha generado el nuevo proyecto "letrero" (PROY-006) con instalación en sitio.`,
      rol: 'administrador',
      createdBy: admin?.nombre || 'MORQUECHO IVETTE',
      createdAt: hoursAgo(4),
    },
    {
      title: 'Proforma Aprobada',
      message: `${SEED_MARKER} La proforma PRO-2026-015 del cliente Constructora Andina fue aprobada.`,
      rol: 'admin',
      createdBy: 'MaybeO',
      createdAt: hoursAgo(8),
    },
    {
      title: 'Instalación Iniciada',
      message: `${SEED_MARKER} El equipo técnico inició la instalación del proyecto PROY-006 en La Carolina, Quito.`,
      rol: 'administrador',
      createdBy: 'Taller Técnico',
      createdAt: hoursAgo(12),
    },
    {
      title: 'Horas Extras Pendientes',
      message: `${SEED_MARKER} Hay 3 registros de horas extras pendientes de aprobación en nómina.`,
      rol: 'admin',
      createdBy: 'Sistema Luxes',
      createdAt: hoursAgo(20),
    },
    {
      title: 'Orden de Compra Aprobada',
      message: `${SEED_MARKER} La orden ORC-2026-038 ha sido aprobada. Puedes retirar materiales en bodega.`,
      rol: 'taller',
      createdBy: admin?.nombre || 'Administración',
      createdAt: hoursAgo(1),
    },
    {
      title: 'Nueva Tarea Asignada',
      message: `${SEED_MARKER} Se te asignó la tarea "Montaje letrero PROY-006" con prioridad alta.`,
      rol: 'taller',
      createdBy: 'MORQUECHO IVETTE',
      createdAt: hoursAgo(3),
    },
    {
      title: 'Instalación Programada',
      message: `${SEED_MARKER} Instalación confirmada para mañana 09:00 en Av. República, Quito (PROY-006).`,
      rol: 'taller',
      createdBy: 'MaybeO',
      createdAt: hoursAgo(6),
    },
    {
      title: 'Recepción de Insumos Pendiente',
      message: `${SEED_MARKER} La orden ORC-2026-035 fue aprobada. Pendiente recepción en bodega.`,
      rol: 'taller',
      createdBy: 'Administración',
      createdAt: hoursAgo(10),
    },
    {
      title: 'Nuevo Trabajo de Impresión',
      message: `${SEED_MARKER} Documento "Banner 3x2m - Feria" enviado a cola. [PROYECTO_ID:PROY-006]`,
      rol: 'impresion',
      createdBy: 'JoseA',
      createdAt: hoursAgo(1.5),
    },
    {
      title: 'Diseño Aprobado - Listo para Impresión',
      message: `${SEED_MARKER} El diseño del proyecto PROY-006 fue aprobado por el cliente.`,
      rol: 'impresion',
      createdBy: admin?.nombre || 'Ventas',
      createdAt: hoursAgo(5),
    },
    {
      title: 'Impresión en Cola',
      message: `${SEED_MARKER} Lona publicitaria 4x6m agregada a la cola de impresión.`,
      rol: 'impresion',
      createdBy: 'CristoferS',
      createdAt: hoursAgo(9),
    },
    {
      title: 'Proforma Rechazada',
      message: `${SEED_MARKER} El cliente rechazó la proforma PRO-2026-011. Revisar cotización.`,
      rol: 'ventas',
      createdBy: 'Cliente',
      createdAt: hoursAgo(2.5),
    },
    {
      title: 'Proyecto Avanzó a Diseño',
      message: `${SEED_MARKER} El proyecto PROY-006 pasó a fase de Diseño. Revisar arte pendiente.`,
      rol: 'ventas',
      createdBy: 'Sistema Luxes',
      createdAt: hoursAgo(7),
    },
    {
      title: 'Arte Pendiente de Aprobación',
      message: `${SEED_MARKER} El proyecto PROY-006 tiene diseño listo. Falta fecha de aprobación del cliente.`,
      rol: 'disenador',
      createdBy: 'MaybeO',
      createdAt: hoursAgo(4.5),
    },
    {
      title: 'Nuevo Proyecto Asignado',
      message: `${SEED_MARKER} Proyecto "letrero" (PROY-006) asignado para diseño e impresión.`,
      rol: 'disenador',
      createdBy: admin?.nombre || 'Ventas',
      createdAt: hoursAgo(11),
    },
  ];

  const userSpecific: NotifInput[] = [];

  if (admin) {
    userSpecific.push(
      {
        title: 'Recordatorio de Cierre',
        message: `${SEED_MARKER} Revisa órdenes de compra y aprobaciones pendientes antes del cierre del día.`,
        userId: admin.id,
        createdBy: 'Sistema Luxes',
        createdAt: hoursAgo(0.5),
      },
      {
        title: 'Instalación Completada',
        message: `${SEED_MARKER} Taller reportó instalación completada en PROY-006. Pendiente encuesta al cliente.`,
        userId: admin.id,
        createdBy: 'Taller Técnico',
        createdAt: hoursAgo(3.5),
      },
    );
  }

  if (taller) {
    userSpecific.push({
      title: 'Solicitud de Materiales',
      message: `${SEED_MARKER} Bodega confirmó disponibilidad de vinilo para PROY-006.`,
      userId: taller.id,
      createdBy: 'Bodega',
      createdAt: hoursAgo(2.2),
    });
  }

  const all = [...roleNotifications, ...userSpecific];
  let created = 0;

  for (const notif of all) {
    await prisma.notification.create({
      data: {
        title: notif.title,
        message: notif.message,
        rol: notif.rol?.toLowerCase() ?? null,
        permission: notif.permission ?? null,
        userId: notif.userId ?? null,
        createdBy: notif.createdBy ?? 'Sistema Luxes',
        createdAt: notif.createdAt ?? new Date(),
        isRead: notif.isRead ?? false,
      },
    });
    created++;
  }

  console.log(`\n✓ ${created} notificaciones de prueba creadas.`);
  console.log('  Marcador en mensaje:', SEED_MARKER);
  console.log('  Admin objetivo:', admin ? `${admin.username} (${admin.nombre})` : 'no encontrado');
  console.log('  Taller:', taller?.username ?? '—');
  console.log('  Impresión:', impresion?.username ?? '—');
  console.log('  Ventas:', ventas?.username ?? '—');
  console.log('  Diseñador:', disenador?.username ?? '—');
  console.log('\nRecarga /notificaciones en el frontend para verlas.');
  if (!fresh) {
    console.log('Para reemplazar pruebas anteriores: npm run db:seed-notifications -- --fresh\n');
  }
}

main()
  .catch((e) => {
    console.error('Error al sembrar notificaciones:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
