import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../../../auth/infrastructure/middleware/authMiddleware.js';
import { NotificationController } from '../adapters/http/notificationController.js';

function asyncHandler(
  handler: (req: Request, res: Response) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res)).catch((err) => {
      if (res.headersSent) return next(err);
      console.error('[Notifications Route Error]', err);
      res.status(500).json({
        success: false,
        error: { message: err?.message || 'Error interno del servidor.' },
      });
    });
  };
}

export function createNotificationRoutes(ctrl: NotificationController): Router {
  const router = Router();

  router.use(authMiddleware);

  router.get('/', asyncHandler((req, res) => ctrl.getNotifications(req, res)));
  router.get('/unread-count', asyncHandler((req, res) => ctrl.getUnreadCount(req, res)));
  router.put('/:id/read', asyncHandler((req, res) => ctrl.markAsRead(req, res)));
  router.post('/push-subscribe', asyncHandler((req, res) => ctrl.subscribePush(req, res)));
  router.post('/push-unsubscribe', asyncHandler((req, res) => ctrl.unsubscribePush(req, res)));

  return router;
}
