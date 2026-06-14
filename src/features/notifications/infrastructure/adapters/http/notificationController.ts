import { Request, Response } from 'express';
import { NotificationService } from '../../../application/services/NotificationService.js';

export class NotificationController {
  constructor(private readonly service: NotificationService) {}

  private fail(res: Response, error: any, status = 500) {
    console.error('[NotificationController Error]', error);
    return res.status(status).json({
      success: false,
      error: { message: error.message || 'Error interno del servidor.' },
    });
  }

  private ok(res: Response, data: any) {
    return res.json({ success: true, data });
  }

  async getNotifications(req: Request, res: Response) {
    try {
      const user = (req as any).user;
      if (!user?.id) throw new Error('Usuario no autenticado.');

      const data = await this.service.getNotificationsForUser(user.id, user.rol || 'visor');
      return this.ok(res, data);
    } catch (e) {
      return this.fail(res, e);
    }
  }

  async getUnreadCount(req: Request, res: Response) {
    try {
      const user = (req as any).user;
      if (!user?.id) throw new Error('Usuario no autenticado.');

      const count = await this.service.getUnreadCountForUser(user.id, user.rol || 'visor');
      return this.ok(res, { count });
    } catch (e) {
      return this.fail(res, e);
    }
  }

  async markAsRead(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      const data = await this.service.markAsRead(id);
      return this.ok(res, data);
    } catch (e) {
      return this.fail(res, e);
    }
  }

  async subscribePush(req: Request, res: Response) {
    try {
      const user = (req as any).user;
      if (!user?.id) throw new Error('Usuario no autenticado.');

      const subscription = req.body;
      await this.service.savePushSubscription(user.id, subscription);
      return this.ok(res, { success: true });
    } catch (e) {
      return this.fail(res, e, 400);
    }
  }

  async unsubscribePush(req: Request, res: Response) {
    try {
      const user = (req as any).user;
      if (!user?.id) throw new Error('Usuario no autenticado.');

      const { endpoint } = req.body;
      await this.service.deletePushSubscription(user.id, endpoint);
      return this.ok(res, { success: true });
    } catch (e) {
      return this.fail(res, e, 400);
    }
  }
}
