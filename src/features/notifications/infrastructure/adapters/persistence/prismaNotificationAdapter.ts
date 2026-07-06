import { PrismaClient } from '@prisma/client';
import type {
  NotificationRepositoryPort,
  NotificationData,
} from '../../../domain/ports/NotificationRepositoryPort.js';

function stripEmojis(text: string): string {
  if (!text) return '';
  return text
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')
    .replace(/[\u{2600}-\u{26FF}]/gu, '')
    .replace(/[\u{2700}-\u{27BF}]/gu, '')
    .trim();
}

function expandRoleAliases(role: string): string[] {
  const r = role.toLowerCase();
  const aliases = new Set([r]);
  if (r === 'impresión' || r === 'impresion') {
    aliases.add('impresión');
    aliases.add('impresion');
  }
  if (r === 'admin' || r === 'administrador') {
    aliases.add('admin');
    aliases.add('administrador');
  }
  if (r === 'taller') {
    aliases.add('taller');
  }
  if (r === 'ventas' || r.includes('ventas') || r === 'diseñador' || r === 'disenador') {
    aliases.add('ventas');
    aliases.add('diseñador');
    aliases.add('disenador');
  }
  return Array.from(aliases);
}

/** Títulos de cola de impresión que no deben mostrarse al rol Taller. */
const TALLER_EXCLUDED_TITLE_PATTERNS = [
  'nuevo trabajo de impresión',
  'nuevo trabajo de impresion',
  'nuevo trabajo en cola',
  'impresión en cola',
  'impresion en cola',
];

function getRoleExclusionClause(role: string) {
  const r = role.toLowerCase();
  if (r !== 'taller') return null;

  return {
    NOT: {
      OR: TALLER_EXCLUDED_TITLE_PATTERNS.map((pattern) => ({
        title: { contains: pattern, mode: 'insensitive' as const },
      })),
    },
  };
}

/**
 * Una notificación es visible solo si cumple TODOS los criterios definidos:
 * - userId → solo ese usuario
 * - rol → el rol del usuario debe coincidir (si está definido)
 * - permission → el usuario debe tener ese permiso (si está definido)
 */
function buildVisibilityFilter(userId: string, role: string, userPermissions: string[]) {
  const roleAliases = expandRoleAliases(role);

  const permissionClause = userPermissions.length > 0
    ? { OR: [{ permission: null }, { permission: { in: userPermissions } }] }
    : { permission: null };

  const baseFilter = {
    OR: [
      { userId },
      {
        AND: [
          { userId: null },
          {
            OR: [
              { rol: null },
              { rol: { in: roleAliases } },
            ],
          },
          permissionClause,
        ],
      },
    ],
  };

  const roleExclusion = getRoleExclusionClause(role);
  if (!roleExclusion) return baseFilter;

  return { AND: [baseFilter, roleExclusion] };
}

export class PrismaNotificationAdapter implements NotificationRepositoryPort {
  constructor(private readonly prisma: PrismaClient) {}

  async findAllForUser(userId: string, role: string): Promise<NotificationData[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: {
          include: {
            permissions: {
              include: {
                permission: true,
              },
            },
          },
        },
      },
    });
    const userPermissions = user?.role?.permissions?.map((rp) => rp.permission.key) || [];

    const rows = await this.prisma.notification.findMany({
      where: {
        isRead: false,
        ...buildVisibilityFilter(userId, role, userPermissions),
      },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map((row) => ({
      ...row,
      createdBy: row.createdBy || 'Sistema Luxes',
    })) as unknown as NotificationData[];
  }

  async countUnreadForUser(userId: string, role: string): Promise<number> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: {
          include: {
            permissions: {
              include: {
                permission: true,
              },
            },
          },
        },
      },
    });
    const userPermissions = user?.role?.permissions?.map((rp) => rp.permission.key) || [];

    const count = await this.prisma.notification.count({
      where: {
        isRead: false,
        ...buildVisibilityFilter(userId, role, userPermissions),
      },
    });

    return count;
  }

  async markAsRead(id: string): Promise<NotificationData> {
    const row = await this.prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });
    return {
      ...row,
      createdBy: row.createdBy || 'Sistema Luxes',
    } as unknown as NotificationData;
  }

  async createNotification(data: {
    title: string;
    message: string;
    rol?: string;
    userId?: string;
    createdBy?: string;
  }): Promise<NotificationData> {
    const row = await this.prisma.notification.create({
      data: {
        title: stripEmojis(data.title),
        message: stripEmojis(data.message),
        rol: data.rol ? data.rol.toLowerCase() : null,
        userId: data.userId || null,
        createdBy: data.createdBy || null,
      },
    });
    return row as unknown as NotificationData;
  }

  async savePushSubscription(userId: string, subscription: any): Promise<void> {
    const { endpoint, keys } = subscription;
    if (!endpoint || !keys?.p256dh || !keys?.auth) return;

    await this.prisma.pushSubscription.upsert({
      where: { endpoint },
      update: {
        p256dh: keys.p256dh,
        auth: keys.auth,
        userId,
      },
      create: {
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userId,
      },
    });
  }

  async deletePushSubscription(userId: string, endpoint: string): Promise<void> {
    await this.prisma.pushSubscription.deleteMany({
      where: {
        endpoint,
        userId,
      },
    });
  }
}
