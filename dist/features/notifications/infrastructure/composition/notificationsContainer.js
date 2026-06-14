import { PrismaClient } from '@prisma/client';
import { PrismaNotificationAdapter } from '../adapters/persistence/prismaNotificationAdapter.js';
import { NotificationService } from '../../application/services/NotificationService.js';
import { NotificationController } from '../adapters/http/notificationController.js';
import { createNotificationRoutes } from '../routes/notificationRoutes.js';
let notificationServiceInstance = null;
export function getNotificationService(prisma) {
    if (!notificationServiceInstance) {
        const adapter = new PrismaNotificationAdapter(prisma);
        notificationServiceInstance = new NotificationService(adapter);
    }
    return notificationServiceInstance;
}
export async function createNotificationsModule() {
    const prisma = new PrismaClient();
    const service = getNotificationService(prisma);
    const controller = new NotificationController(service);
    const notificationsRoutes = createNotificationRoutes(controller);
    return { notificationsRoutes };
}
