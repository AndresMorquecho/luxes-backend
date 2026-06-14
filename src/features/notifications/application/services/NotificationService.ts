import type { NotificationRepositoryPort, NotificationData } from '../../domain/ports/NotificationRepositoryPort.js';

export class NotificationService {
  constructor(private readonly repo: NotificationRepositoryPort) {}

  async getNotificationsForUser(userId: string, role: string): Promise<NotificationData[]> {
    if (!userId) throw new Error('Identificación de usuario inválida.');
    return this.repo.findAllForUser(userId, role);
  }

  async getUnreadCountForUser(userId: string, role: string): Promise<number> {
    if (!userId) throw new Error('Identificación de usuario inválida.');
    return this.repo.countUnreadForUser(userId, role);
  }

  async markAsRead(id: string): Promise<NotificationData> {
    if (!id) throw new Error('Identificación de notificación inválida.');
    return this.repo.markAsRead(id);
  }

  async createNotification(data: {
    title: string;
    message: string;
    rol?: string;
    userId?: string;
    createdBy?: string;
  }): Promise<NotificationData> {
    return this.repo.createNotification(data);
  }

  async savePushSubscription(userId: string, subscription: any): Promise<void> {
    return this.repo.savePushSubscription(userId, subscription);
  }

  async deletePushSubscription(userId: string, endpoint: string): Promise<void> {
    return this.repo.deletePushSubscription(userId, endpoint);
  }
}
