export class NotificationService {
    repo;
    constructor(repo) {
        this.repo = repo;
    }
    async getNotificationsForUser(userId, role) {
        if (!userId)
            throw new Error('Identificación de usuario inválida.');
        return this.repo.findAllForUser(userId, role);
    }
    async getUnreadCountForUser(userId, role) {
        if (!userId)
            throw new Error('Identificación de usuario inválida.');
        return this.repo.countUnreadForUser(userId, role);
    }
    async markAsRead(id) {
        if (!id)
            throw new Error('Identificación de notificación inválida.');
        return this.repo.markAsRead(id);
    }
    async createNotification(data) {
        return this.repo.createNotification(data);
    }
    async savePushSubscription(userId, subscription) {
        return this.repo.savePushSubscription(userId, subscription);
    }
    async deletePushSubscription(userId, endpoint) {
        return this.repo.deletePushSubscription(userId, endpoint);
    }
}
