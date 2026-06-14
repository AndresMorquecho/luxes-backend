import { Router } from 'express';
import { authMiddleware } from '../../../auth/infrastructure/middleware/authMiddleware.js';
import { NotificationController } from '../adapters/http/notificationController.js';

export function createNotificationRoutes(ctrl: NotificationController): Router {
  const router = Router();

  router.use(authMiddleware);

  router.get('/', (req, res) => ctrl.getNotifications(req, res));
  router.get('/unread-count', (req, res) => ctrl.getUnreadCount(req, res));
  router.put('/:id/read', (req, res) => ctrl.markAsRead(req, res));
  router.post('/push-subscribe', (req, res) => ctrl.subscribePush(req, res));
  router.post('/push-unsubscribe', (req, res) => ctrl.unsubscribePush(req, res));

  return router;
}
