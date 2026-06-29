function stripEmojis(text) {
    if (!text)
        return '';
    return text
        .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')
        .replace(/[\u{2600}-\u{26FF}]/gu, '')
        .replace(/[\u{2700}-\u{27BF}]/gu, '')
        .trim();
}
function expandRoleAliases(role) {
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
/**
 * Una notificación es visible solo si cumple TODOS los criterios definidos:
 * - userId → solo ese usuario
 * - rol → el rol del usuario debe coincidir (si está definido)
 * - permission → el usuario debe tener ese permiso (si está definido)
 */
function buildVisibilityFilter(userId, role, userPermissions) {
    const roleAliases = expandRoleAliases(role);
    const permissionClause = userPermissions.length > 0
        ? { OR: [{ permission: null }, { permission: { in: userPermissions } }] }
        : { permission: null };
    return {
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
}
export class PrismaNotificationAdapter {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findAllForUser(userId, role) {
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
        }));
    }
    async countUnreadForUser(userId, role) {
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
    async markAsRead(id) {
        const row = await this.prisma.notification.update({
            where: { id },
            data: { isRead: true },
        });
        return {
            ...row,
            createdBy: row.createdBy || 'Sistema Luxes',
        };
    }
    async createNotification(data) {
        const row = await this.prisma.notification.create({
            data: {
                title: stripEmojis(data.title),
                message: stripEmojis(data.message),
                rol: data.rol ? data.rol.toLowerCase() : null,
                userId: data.userId || null,
                createdBy: data.createdBy || null,
            },
        });
        return row;
    }
    async savePushSubscription(userId, subscription) {
        const { endpoint, keys } = subscription;
        if (!endpoint || !keys?.p256dh || !keys?.auth)
            return;
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
    async deletePushSubscription(userId, endpoint) {
        await this.prisma.pushSubscription.deleteMany({
            where: {
                endpoint,
                userId,
            },
        });
    }
}
