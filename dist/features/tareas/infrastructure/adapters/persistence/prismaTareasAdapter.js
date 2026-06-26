import webpush from 'web-push';
import { env } from '../../../../../config/env.js';
import { sendPushToRole } from '../../../../../shared/services/pushNotificationService.js';
// Configure web-push with VAPID keys
if (env.vapidPublicKey && env.vapidPrivateKey) {
    webpush.setVapidDetails(env.vapidEmail, env.vapidPublicKey, env.vapidPrivateKey);
}
const tareaInclude = {
    creadoPor: { select: { id: true, nombre: true, email: true } },
    asignaciones: {
        include: {
            user: { select: { id: true, nombre: true, email: true, username: true } },
        },
    },
};
export class PrismaTareasAdapter {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findAll(options) {
        const page = options?.page || 1;
        const limit = options?.limit || 20;
        const skip = (page - 1) * limit;
        const where = {};
        if (options?.estado) {
            if (options.estado === 'active') {
                where.estado = { in: ['pendiente', 'en_progreso'] };
            }
            else if (options.estado === 'history') {
                where.estado = { in: ['completada', 'cancelada'] };
            }
            else {
                where.estado = options.estado;
            }
        }
        if (options?.prioridad)
            where.prioridad = options.prioridad;
        if (options?.search) {
            where.OR = [
                { titulo: { contains: options.search, mode: 'insensitive' } },
                { descripcion: { contains: options.search, mode: 'insensitive' } },
            ];
        }
        const [items, total] = await Promise.all([
            this.prisma.tarea.findMany({
                where,
                include: tareaInclude,
                orderBy: { fechaCreacion: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.tarea.count({ where }),
        ]);
        return { items: items, total };
    }
    async findByUserId(userId, options) {
        const page = options?.page || 1;
        const limit = options?.limit || 20;
        const skip = (page - 1) * limit;
        const where = {
            asignaciones: { some: { userId } },
        };
        if (options?.estado) {
            if (options.estado === 'active') {
                where.estado = { in: ['pendiente', 'en_progreso'] };
            }
            else if (options.estado === 'history') {
                where.estado = { in: ['completada', 'cancelada'] };
            }
            else {
                where.estado = options.estado;
            }
        }
        if (options?.prioridad)
            where.prioridad = options.prioridad;
        const [items, total] = await Promise.all([
            this.prisma.tarea.findMany({
                where,
                include: tareaInclude,
                orderBy: { fechaCreacion: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.tarea.count({ where }),
        ]);
        return { items: items, total };
    }
    async findById(id) {
        const row = await this.prisma.tarea.findUnique({
            where: { id },
            include: tareaInclude,
        });
        return row;
    }
    async create(data) {
        let parsedFechaLimite = null;
        if (data.fechaLimite) {
            const d = new Date(data.fechaLimite);
            if (!isNaN(d.getTime())) {
                parsedFechaLimite = d;
            }
        }
        const row = await this.prisma.tarea.create({
            data: {
                titulo: data.titulo.trim(),
                descripcion: data.descripcion?.trim() || null,
                prioridad: data.prioridad || 'media',
                fechaLimite: parsedFechaLimite,
                creadoPorId: data.creadoPorId,
                asignaciones: {
                    create: data.asignadoA.map(userId => ({ userId })),
                },
            },
            include: tareaInclude,
        });
        // ── Notifications ────────────────────────────────────────────────────────
        try {
            const creador = row.creadoPor;
            const prioridadLabel = data.prioridad === 'alta' ? 'Alta' : data.prioridad === 'baja' ? 'Baja' : 'Media';
            // Create in-app notification per assigned user
            for (const asig of row.asignaciones) {
                await this.prisma.notification.create({
                    data: {
                        title: 'Nueva Tarea Asignada',
                        message: `${creador.nombre} te ha asignado la tarea "${row.titulo}" con prioridad ${prioridadLabel}.`,
                        userId: asig.userId,
                        createdBy: creador.nombre,
                    },
                });
            }
            // Send PWA push notifications
            const assignedUserIds = data.asignadoA;
            const usersWithSubs = await this.prisma.user.findMany({
                where: { id: { in: assignedUserIds } },
                include: { pushSubscriptions: true },
            });
            const pushPayload = JSON.stringify({
                title: 'Nueva Tarea Asignada',
                body: `${creador.nombre}: "${row.titulo}" — Prioridad ${prioridadLabel}`,
                url: '/tareas',
            });
            for (const user of usersWithSubs) {
                for (const sub of user.pushSubscriptions) {
                    try {
                        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, pushPayload);
                    }
                    catch (pushErr) {
                        console.error(`[Web Push Error] Failed to send task notification to ${sub.endpoint}:`, pushErr.message);
                        if (pushErr.statusCode === 404 || pushErr.statusCode === 410) {
                            await this.prisma.pushSubscription.delete({ where: { endpoint: sub.endpoint } });
                        }
                    }
                }
            }
        }
        catch (err) {
            console.error('[Tareas Notification Error]', err);
        }
        return row;
    }
    async update(id, data, updater) {
        const currentTarea = await this.prisma.tarea.findUnique({
            where: { id },
        });
        if (!currentTarea)
            throw new Error('Tarea no encontrada.');
        const updateData = {
            fechaActualizacion: new Date(),
        };
        if (data.titulo !== undefined)
            updateData.titulo = data.titulo.trim();
        if (data.descripcion !== undefined)
            updateData.descripcion = data.descripcion?.trim() || null;
        if (data.prioridad !== undefined)
            updateData.prioridad = data.prioridad;
        if (data.estado !== undefined)
            updateData.estado = data.estado;
        if (data.fechaLimite !== undefined) {
            let parsedFechaLimite = null;
            if (data.fechaLimite) {
                const d = new Date(data.fechaLimite);
                if (!isNaN(d.getTime())) {
                    parsedFechaLimite = d;
                }
            }
            updateData.fechaLimite = parsedFechaLimite;
        }
        // If re-assigning users, delete old and create new
        if (data.asignadoA) {
            await this.prisma.tareaAsignacion.deleteMany({ where: { tareaId: id } });
            updateData.asignaciones = {
                create: data.asignadoA.map(userId => ({ userId })),
            };
        }
        const row = await this.prisma.tarea.update({
            where: { id },
            data: updateData,
            include: tareaInclude,
        });
        // ── Notifications on state change ─────────────────────────────────────────
        if (data.estado !== undefined && data.estado !== currentTarea.estado) {
            const isStart = data.estado === 'en_progreso';
            const isComplete = data.estado === 'completada';
            if (isStart || isComplete) {
                try {
                    let updaterName = 'Un colaborador';
                    if (updater?.id) {
                        const dbUser = await this.prisma.user.findUnique({ where: { id: updater.id } });
                        if (dbUser) {
                            updaterName = dbUser.nombre;
                        }
                    }
                    const now = new Date();
                    const fechaHoraStr = now.toLocaleString('es-EC', { timeZone: 'America/Guayaquil' });
                    let notifTitle = '';
                    let notifMessage = '';
                    if (isStart) {
                        notifTitle = 'Tarea Iniciada';
                        notifMessage = `${updaterName} empezó con la tarea "${row.titulo}" el ${fechaHoraStr}.`;
                    }
                    else {
                        notifTitle = 'Tarea Finalizada';
                        notifMessage = `${updaterName} terminó la tarea "${row.titulo}" el ${fechaHoraStr}.`;
                    }
                    // UNA sola notificación para admin (expandRoleAliases cubre 'administrador' en la query)
                    await this.prisma.notification.create({
                        data: {
                            title: notifTitle,
                            message: notifMessage,
                            rol: 'admin',
                            createdBy: updaterName,
                        },
                    });
                    // Send PWA push notification to administrators (single canonical role)
                    const pushPayload = {
                        title: notifTitle,
                        body: notifMessage,
                        data: { url: '/tareas' },
                    };
                    await sendPushToRole('admin', pushPayload).catch(() => { });
                }
                catch (err) {
                    console.error('[Tareas Status Notification Error]', err);
                }
            }
        }
        return row;
    }
    async delete(id) {
        await this.prisma.tarea.delete({ where: { id } });
    }
    async getStats(userId) {
        const baseWhere = userId
            ? { asignaciones: { some: { userId } } }
            : {};
        const [total, pendientes, enProgreso, completadas, canceladas] = await Promise.all([
            this.prisma.tarea.count({ where: baseWhere }),
            this.prisma.tarea.count({ where: { ...baseWhere, estado: 'pendiente' } }),
            this.prisma.tarea.count({ where: { ...baseWhere, estado: 'en_progreso' } }),
            this.prisma.tarea.count({ where: { ...baseWhere, estado: 'completada' } }),
            this.prisma.tarea.count({ where: { ...baseWhere, estado: 'cancelada' } }),
        ]);
        return { total, pendientes, enProgreso, completadas, canceladas };
    }
}
