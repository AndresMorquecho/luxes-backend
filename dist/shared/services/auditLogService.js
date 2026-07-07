import { prisma } from '../../config/prismaClient.js';
export async function logAuditAction(params) {
    try {
        let nombre = params.usuarioNom?.trim() || null;
        if (!nombre && params.userId) {
            const user = await prisma.user.findUnique({
                where: { id: params.userId },
                select: { nombre: true },
            });
            nombre = user?.nombre || 'Desconocido';
        }
        await prisma.auditLog.create({
            data: {
                userId: params.userId || null,
                usuarioNom: nombre,
                accion: params.accion,
                modulo: params.modulo,
                detalle: params.detalle,
                severidad: params.severidad || 'Info',
            },
        });
    }
    catch (err) {
        console.error('[AuditLog] Error al registrar auditoría:', err?.message || err);
    }
}
