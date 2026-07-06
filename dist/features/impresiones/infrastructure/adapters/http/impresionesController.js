import { prisma } from '../../../../../config/prismaClient.js';
import { sendPushToRole } from '../../../../../shared/services/pushNotificationService.js';
export class ImpresionesController {
    async list(req, res) {
        try {
            const jobs = await prisma.impresionJob.findMany({
                orderBy: { createdAt: 'desc' },
            });
            // Classify jobs
            // 1. activeJob: at most one job with status "Listo", "Imprimiendo", or "Pausado"
            const activeJob = jobs.find((j) => ['Listo', 'Imprimiendo', 'Pausado'].includes(j.status)) || null;
            // 2. queue: jobs in "En espera", sorted by position, then createdAt
            const queue = jobs
                .filter((j) => j.status === 'En espera')
                .sort((a, b) => {
                if (a.position !== b.position)
                    return a.position - b.position;
                return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
            });
            // 3. completedJobs: jobs in "Completado" or "Cancelado"
            const completedJobs = jobs
                .filter((j) => ['Completado', 'Cancelado'].includes(j.status))
                .sort((a, b) => {
                const aTime = a.completedAt ? new Date(a.completedAt).getTime() : 0;
                const bTime = b.completedAt ? new Date(b.completedAt).getTime() : 0;
                return bTime - aTime;
            });
            return res.status(200).json({
                success: true,
                data: {
                    activeJob,
                    queue,
                    completedJobs,
                },
            });
        }
        catch (error) {
            console.error('[impresiones/list]', error);
            return res.status(500).json({
                success: false,
                error: { code: 'INTERNAL_ERROR', message: 'Error al obtener trabajos de impresión' },
            });
        }
    }
    async create(req, res) {
        try {
            const b = req.body || {};
            if (b.proyectoId) {
                const existing = await prisma.impresionJob.findFirst({
                    where: {
                        proyectoId: String(b.proyectoId),
                        status: { not: 'Cancelado' },
                    },
                });
                if (existing) {
                    return res.status(409).json({
                        success: false,
                        error: {
                            code: 'ALREADY_SENT',
                            message: 'Este proyecto ya fue enviado a impresión. Solo se permite un envío; sigue el avance en la cola de impresión.',
                        },
                    });
                }
            }
            const maxPosition = await prisma.impresionJob.aggregate({
                _max: { position: true },
                where: { status: 'En espera' },
            });
            const position = (maxPosition._max.position || 0) + 1;
            const job = await prisma.impresionJob.create({
                data: {
                    name: b.name || '',
                    copies: Number(b.copies) || 1,
                    status: 'En espera',
                    format: b.format || '',
                    sentBy: b.sentBy || 'Desconocido',
                    sentAt: b.sentAt || new Date().toLocaleString(),
                    sentToQueueAt: b.sentToQueueAt || new Date().toLocaleString(),
                    fileUrl: b.fileUrl || null,
                    client: b.client || '',
                    urgency: b.urgency || 'Media',
                    width: Number(b.width) || 1.0,
                    height: Number(b.height) || 1.0,
                    notes: b.notes || '',
                    proyectoId: b.proyectoId || null,
                    proyectoNombre: b.proyectoNombre || null,
                    position,
                },
            });
            // Notificar solo a Impresión y Administración (no al rol Taller)
            try {
                const rolesToNotify = ['impresión', 'admin'];
                for (const roleName of rolesToNotify) {
                    await prisma.notification.create({
                        data: {
                            title: 'Nuevo Trabajo de Impresión',
                            message: `Se ha enviado el documento "${job.name}" para ${job.client} a la cola de impresión.`,
                            rol: roleName,
                            createdBy: job.sentBy,
                        },
                    });
                }
                const pushPayload = {
                    title: 'Nuevo Trabajo en Cola',
                    body: `El documento "${job.name}" para ${job.client} está en la cola de impresión.`,
                    data: {
                        url: '/colas-impresion',
                    },
                };
                await sendPushToRole('impresión', pushPayload);
                await sendPushToRole('admin', pushPayload);
            }
            catch (notifErr) {
                console.error('[impresiones/create] Error al generar notificación:', notifErr);
            }
            return res.status(201).json({ success: true, data: job });
        }
        catch (error) {
            console.error('[impresiones/create]', error);
            return res.status(500).json({
                success: false,
                error: { code: 'INTERNAL_ERROR', message: 'Error al crear trabajo de impresión' },
            });
        }
    }
    async update(req, res) {
        try {
            const { id } = req.params;
            const b = req.body || {};
            const currentJob = await prisma.impresionJob.findUnique({
                where: { id: Number(id) },
            });
            if (!currentJob) {
                return res.status(404).json({
                    success: false,
                    error: { code: 'NOT_FOUND', message: 'Trabajo de impresión no encontrado' },
                });
            }
            const updateData = {};
            if (b.status !== undefined)
                updateData.status = b.status;
            if (b.elapsedSeconds !== undefined)
                updateData.elapsedSeconds = Number(b.elapsedSeconds);
            if (b.cancelReason !== undefined)
                updateData.cancelReason = b.cancelReason;
            if (b.responsible !== undefined)
                updateData.responsible = b.responsible;
            if (b.startTime !== undefined)
                updateData.startTime = b.startTime;
            if (b.startedPrintingAt !== undefined)
                updateData.startedPrintingAt = b.startedPrintingAt;
            if (b.completedAt !== undefined)
                updateData.completedAt = b.completedAt;
            // Status change logic for notifications
            if (b.status !== undefined && b.status !== currentJob.status) {
                const username = b.responsible || 'Operador';
                const nowStr = new Date().toLocaleString();
                const projSuffix = currentJob.proyectoId ? ` [PROYECTO_ID:${currentJob.proyectoId}]` : '';
                if (b.status === 'Imprimiendo') {
                    updateData.startedPrintingAt = nowStr;
                    updateData.startTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                    updateData.responsible = username;
                    const consumoMsg = b.consumoDetalle ? ` Materiales a descontar: ${b.consumoDetalle}.` : '';
                    try {
                        const rolesToNotify = ['admin', 'ventas'];
                        for (const roleName of rolesToNotify) {
                            await prisma.notification.create({
                                data: {
                                    title: 'Impresión Iniciada',
                                    message: `El operador ${username} ha iniciado la impresión de "${currentJob.name}".${consumoMsg}${projSuffix}`,
                                    rol: roleName,
                                    createdBy: username,
                                },
                            });
                            await sendPushToRole(roleName, {
                                title: '🖨️ Impresión Iniciada',
                                body: `Se inició la impresión de "${currentJob.name}" por ${username}.${consumoMsg}`,
                                data: { url: `/colas-impresion` },
                            }).catch(() => { });
                        }
                    }
                    catch (e) {
                        console.error(e);
                    }
                }
                else if (b.status === 'Completado') {
                    updateData.completedAt = nowStr;
                    try {
                        const rolesToNotify = ['admin', 'ventas'];
                        for (const roleName of rolesToNotify) {
                            await prisma.notification.create({
                                data: {
                                    title: 'Impresión Completada',
                                    message: `La impresión de "${currentJob.name}" ha finalizado con éxito.${projSuffix}`,
                                    rol: roleName,
                                    createdBy: username,
                                },
                            });
                            await sendPushToRole(roleName, {
                                title: '✅ Impresión Completada',
                                body: `La impresión de "${currentJob.name}" ha finalizado con éxito.`,
                                data: { url: `/colas-impresion` },
                            }).catch(() => { });
                        }
                    }
                    catch (e) {
                        console.error(e);
                    }
                }
                else if (b.status === 'Cancelado') {
                    updateData.completedAt = nowStr;
                    try {
                        const rolesToNotify = ['admin', 'ventas'];
                        for (const roleName of rolesToNotify) {
                            await prisma.notification.create({
                                data: {
                                    title: 'Impresión Cancelada',
                                    message: `Se canceló la impresión de "${currentJob.name}". Motivo: ${b.cancelReason || 'No especificado'}${projSuffix}`,
                                    rol: roleName,
                                    createdBy: username,
                                },
                            });
                            await sendPushToRole(roleName, {
                                title: '❌ Impresión Cancelada',
                                body: `Se canceló la impresión de "${currentJob.name}". Motivo: ${b.cancelReason || 'No especificado'}`,
                                data: { url: `/colas-impresion` },
                            }).catch(() => { });
                        }
                    }
                    catch (e) {
                        console.error(e);
                    }
                }
            }
            const updated = await prisma.impresionJob.update({
                where: { id: Number(id) },
                data: updateData,
            });
            return res.status(200).json({ success: true, data: updated });
        }
        catch (error) {
            console.error('[impresiones/update]', error);
            return res.status(500).json({
                success: false,
                error: { code: 'INTERNAL_ERROR', message: 'Error al actualizar trabajo de impresión' },
            });
        }
    }
    async remove(req, res) {
        try {
            const { id } = req.params;
            await prisma.impresionJob.delete({
                where: { id: Number(id) },
            });
            return res.status(200).json({ success: true, data: { id: Number(id) } });
        }
        catch (error) {
            console.error('[impresiones/remove]', error);
            return res.status(500).json({
                success: false,
                error: { code: 'INTERNAL_ERROR', message: 'Error al eliminar trabajo de impresión' },
            });
        }
    }
    async reorder(req, res) {
        try {
            const { ids } = req.body || {};
            if (!Array.isArray(ids)) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'INVALID_INPUT', message: 'Se requiere una lista de IDs de trabajos' },
                });
            }
            for (let i = 0; i < ids.length; i++) {
                await prisma.impresionJob.update({
                    where: { id: Number(ids[i]) },
                    data: { position: i + 1 },
                });
            }
            return res.status(200).json({ success: true });
        }
        catch (error) {
            console.error('[impresiones/reorder]', error);
            return res.status(500).json({
                success: false,
                error: { code: 'INTERNAL_ERROR', message: 'Error al reordenar la cola de impresión' },
            });
        }
    }
}
