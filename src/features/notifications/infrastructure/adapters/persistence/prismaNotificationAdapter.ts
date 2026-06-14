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

export class PrismaNotificationAdapter implements NotificationRepositoryPort {
  constructor(private readonly prisma: PrismaClient) {}

  async findAllForUser(userId: string, role: string): Promise<NotificationData[]> {
    const rolesToCheck = [role.toLowerCase()];
    if (role.toLowerCase() === 'admin' || role.toLowerCase() === 'administrador') {
      rolesToCheck.push('admin');
      rolesToCheck.push('administrador');
    }

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
    const userPermissions = user?.role?.permissions.map(rp => rp.permission.key) || [];

    const rows = await this.prisma.notification.findMany({
      where: {
        isRead: false,
        OR: [
          { userId },
          { rol: { in: rolesToCheck } },
          { permission: { in: userPermissions } },
          {
            AND: [
              { rol: null },
              { permission: null },
              { userId: null },
            ],
          },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });

    return rows as unknown as NotificationData[];
  }

  async countUnreadForUser(userId: string, role: string): Promise<number> {
    const rolesToCheck = [role.toLowerCase()];
    if (role.toLowerCase() === 'admin' || role.toLowerCase() === 'administrador') {
      rolesToCheck.push('admin');
      rolesToCheck.push('administrador');
    }

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
    const userPermissions = user?.role?.permissions.map(rp => rp.permission.key) || [];

    const count = await this.prisma.notification.count({
      where: {
        isRead: false,
        OR: [
          { userId },
          { rol: { in: rolesToCheck } },
          { permission: { in: userPermissions } },
          {
            AND: [
              { rol: null },
              { permission: null },
              { userId: null },
            ],
          },
        ],
      },
    });

    return count;
  }

  async markAsRead(id: string): Promise<NotificationData> {
    const row = await this.prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });
    return row as unknown as NotificationData;
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
