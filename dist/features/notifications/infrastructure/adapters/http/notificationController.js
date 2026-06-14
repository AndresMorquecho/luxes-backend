export class NotificationController {
    service;
    constructor(service) {
        this.service = service;
    }
    fail(res, error, status = 500) {
        console.error('[NotificationController Error]', error);
        return res.status(status).json({
            success: false,
            error: { message: error.message || 'Error interno del servidor.' },
        });
    }
    ok(res, data) {
        return res.json({ success: true, data });
    }
    async getNotifications(req, res) {
        try {
            const user = req.user;
            if (!user?.id)
                throw new Error('Usuario no autenticado.');
            const data = await this.service.getNotificationsForUser(user.id, user.rol || 'visor');
            return this.ok(res, data);
        }
        catch (e) {
            return this.fail(res, e);
        }
    }
    async getUnreadCount(req, res) {
        try {
            const user = req.user;
            if (!user?.id)
                throw new Error('Usuario no autenticado.');
            const count = await this.service.getUnreadCountForUser(user.id, user.rol || 'visor');
            return this.ok(res, { count });
        }
        catch (e) {
            return this.fail(res, e);
        }
    }
    async markAsRead(req, res) {
        try {
            const id = String(req.params.id);
            const data = await this.service.markAsRead(id);
            return this.ok(res, data);
        }
        catch (e) {
            return this.fail(res, e);
        }
    }
    async subscribePush(req, res) {
        try {
            const user = req.user;
            if (!user?.id)
                throw new Error('Usuario no autenticado.');
            const subscription = req.body;
            await this.service.savePushSubscription(user.id, subscription);
            return this.ok(res, { success: true });
        }
        catch (e) {
            return this.fail(res, e, 400);
        }
    }
    async unsubscribePush(req, res) {
        try {
            const user = req.user;
            if (!user?.id)
                throw new Error('Usuario no autenticado.');
            const { endpoint } = req.body;
            await this.service.deletePushSubscription(user.id, endpoint);
            return this.ok(res, { success: true });
        }
        catch (e) {
            return this.fail(res, e, 400);
        }
    }
}
