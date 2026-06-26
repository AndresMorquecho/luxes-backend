import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const notificationsData = [
  {
    title: 'Nueva Orden de Compra',
    message: 'Se ha generado la orden de compra OC-2026-0042 por un valor de $1,250.00 pendiente de aprobación.',
    rol: 'admin',
    permission: 'aprobacion_ordenes_compra',
    createdBy: 'María Fernanda Torres',
    createdAt: new Date('2026-06-24T09:15:00'),
    isRead: false,
  },
  {
    title: 'Nueva Orden de Compra',
    message: 'Se ha generado la orden de compra OC-2026-0043 por un valor de $890.50 pendiente de aprobación.',
    rol: 'administrador',
    permission: 'aprobacion_ordenes_compra',
    createdBy: 'Taller Técnico',
    createdAt: new Date('2026-06-24T11:30:00'),
    isRead: false,
  },
  {
    title: 'Orden de Compra Aprobada',
    message: 'La orden de compra OC-2026-0038 ha sido aprobada.',
    rol: 'taller',
    createdBy: 'Andrés Israel',
    createdAt: new Date('2026-06-24T14:00:00'),
    isRead: false,
  },
  {
    title: 'Tarea Iniciada',
    message: 'María Fernanda Torres empezó con la tarea "Revisar diseño stand feria" el 24/06/2026 08:45.',
    rol: 'admin',
    createdBy: 'María Fernanda Torres',
    createdAt: new Date('2026-06-24T08:45:00'),
    isRead: false,
  },
  {
    title: 'Tarea Finalizada',
    message: 'Impresor Principal terminó la tarea "Imprimir vinilos proyecto Acme" el 24/06/2026 16:20.',
    rol: 'administrador',
    createdBy: 'Impresor Principal',
    createdAt: new Date('2026-06-24T16:20:00'),
    isRead: false,
  },
  {
    title: 'Nueva Tarea Asignada',
    message: 'Se te ha asignado la tarea "Preparar materiales instalación" con prioridad alta.',
    rol: 'taller',
    createdBy: 'Andrés Israel',
    createdAt: new Date('2026-06-25T07:00:00'),
    isRead: false,
  },
  {
    title: 'Nuevo Trabajo de Impresión',
    message: 'Se ha enviado el documento "Banner 3x2m - Feria Comercial" para Cliente Global S.A. a la cola de impresión.',
    rol: 'impresion',
    createdBy: 'Diseñador Creativo',
    createdAt: new Date('2026-06-25T08:30:00'),
    isRead: false,
  },
  {
    title: 'Nuevo Trabajo de Impresión',
    message: 'Se ha enviado el documento "Lona publicitaria 4x6m" para Restaurante El Buen Sabor a la cola de impresión.',
    rol: 'taller',
    createdBy: 'María Fernanda Torres',
    createdAt: new Date('2026-06-25T09:45:00'),
    isRead: false,
  },
  {
    title: 'Diseño Aprobado',
    message: 'El cliente aprobó el diseño del proyecto "Stand Expo 2026". Listo para producción.',
    rol: 'impresion',
    createdBy: 'María Fernanda Torres',
    createdAt: new Date('2026-06-23T15:10:00'),
    isRead: false,
  },
  {
    title: 'Solicitud de Materiales',
    message: 'El taller solicita 15 planchas de acrílico 3mm para el proyecto INST-2026-012.',
    rol: 'admin',
    createdBy: 'Taller Técnico',
    createdAt: new Date('2026-06-23T10:00:00'),
    isRead: false,
  },
  {
    title: 'Recepción de Insumos Pendiente',
    message: 'La orden de compra OC-2026-0035 fue aprobada. Pendiente recepción en bodega.',
    rol: 'taller',
    createdBy: 'Administración',
    createdAt: new Date('2026-06-22T13:30:00'),
    isRead: false,
  },
  {
    title: 'Proforma Aprobada',
    message: 'La proforma PF-2026-0089 del cliente Constructora Andina fue aprobada por el cliente.',
    rol: 'administrador',
    createdBy: 'María Fernanda Torres',
    createdAt: new Date('2026-06-22T09:00:00'),
    isRead: false,
  },
];

async function main() {
  await prisma.notification.deleteMany({});

  const admin = await prisma.user.findFirst({
    where: { OR: [{ username: 'admin' }, { rol: { in: ['admin', 'Administrador', 'administrador'] } }] },
  });
  const taller = await prisma.user.findFirst({ where: { username: 'taller' } });

  const userSpecific = admin
    ? [
        {
          title: 'Recordatorio de Cierre',
          message: 'Recuerda revisar las órdenes de compra pendientes de aprobación antes del cierre del día.',
          userId: admin.id,
          createdBy: 'Sistema Luxes',
          createdAt: new Date('2026-06-25T06:00:00'),
          isRead: false,
        },
      ]
    : [];

  const tallerSpecific = taller
    ? [
        {
          title: 'Instalación Programada',
          message: 'Instalación confirmada para mañana 26/06 a las 09:00 en Centro Comercial Mall del Sol.',
          userId: taller.id,
          createdBy: 'María Fernanda Torres',
          createdAt: new Date('2026-06-25T10:15:00'),
          isRead: false,
        },
      ]
    : [];

  const allNotifications = [...notificationsData, ...userSpecific, ...tallerSpecific];

  let created = 0;
  for (const notif of allNotifications) {
    await prisma.notification.create({ data: notif });
    created++;
  }

  console.log(`✓ ${created} notificaciones de ejemplo creadas correctamente.`);
}

main()
  .catch((e) => {
    console.error('Error al sembrar notificaciones:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
