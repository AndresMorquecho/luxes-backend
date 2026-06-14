export interface NotificationData {
  id: string;
  title: string;
  message: string;
  isRead: boolean;
  rol: string | null;
  permission?: string | null;
  userId: string | null;
  createdBy: string | null;
  createdAt: Date;
}

export interface NotificationRepositoryPort {
  findAllForUser(userId: string, role: string): Promise<NotificationData[]>;
  countUnreadForUser(userId: string, role: string): Promise<number>;
  markAsRead(id: string): Promise<NotificationData>;
  createNotification(data: {
    title: string;
    message: string;
    rol?: string;
    userId?: string;
    createdBy?: string;
  }): Promise<NotificationData>;
  savePushSubscription(userId: string, subscription: any): Promise<void>;
  deletePushSubscription(userId: string, endpoint: string): Promise<void>;
}
