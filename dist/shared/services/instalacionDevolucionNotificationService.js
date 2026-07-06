import { prisma } from '../../config/prismaClient.js';
import { sendPushToUsers } from './pushNotificationService.js';
function normalizeName(value) {
    return value.trim().toLowerCase().replace(/\s+/g, ' ');
}
function cantidadMaterial(m) {
    const raw = m.cantidadLlevada ?? m.cantidad ?? 1;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 1;
}
function esHerramientaRegistro(m, material) {
    const tipo = String(m.tipo || '').toLowerCase();
    if (tipo === 'herramienta')
        return true;
    if (material?.tipo === 'herramienta')
        return true;
    if (material?.esPrestable === true)
        return true;
    return false;
}
async function findMaterial(m) {
    const sku = String(m.sku || '').trim();
    const nombre = String(m.nombre || '').trim();
    if (sku) {
        const bySku = await prisma.material.findFirst({
            where: {
                OR: [
                    { codigo: { equals: sku, mode: 'insensitive' } },
                    { codigo: sku },
                ],
            },
        });
        if (bySku)
            return bySku;
    }
    if (nombre) {
        return prisma.material.findFirst({
            where: { nombre: { equals: nombre, mode: 'insensitive' } },
        });
    }
    return null;
}
async function resolveUserIdForResponsable(responsableNombre, personalAsignado) {
    const nombre = responsableNombre.trim();
    const norm = normalizeName(nombre);
    if (!norm)
        return null;
    const member = personalAsignado.find((p) => normalizeName(String(p.nombre || '')) === norm);
    if (member?.empleadoId) {
        const byEmpleado = await prisma.user.findFirst({
            where: { empleadoId: String(member.empleadoId), estado: 'activo' },
            select: { id: true },
        });
        if (byEmpleado)
            return byEmpleado.id;
    }
    const empleado = await prisma.empleado.findFirst({
        where: { nombre: { equals: nombre, mode: 'insensitive' } },
        select: { id: true, correo: true },
    });
    if (empleado) {
        const byEmpleadoRecord = await prisma.user.findFirst({
            where: {
                estado: 'activo',
                OR: [
                    { empleadoId: empleado.id },
                    ...(empleado.correo
                        ? [{ email: { equals: empleado.correo, mode: 'insensitive' } }]
                        : []),
                ],
            },
            select: { id: true },
        });
        if (byEmpleadoRecord)
            return byEmpleadoRecord.id;
    }
    const users = await prisma.user.findMany({
        where: { estado: 'activo' },
        select: { id: true, nombre: true },
    });
    const exact = users.find((u) => normalizeName(u.nombre) === norm);
    if (exact)
        return exact.id;
    const partial = users.find((u) => {
        const userName = normalizeName(u.nombre);
        return userName.includes(norm) || norm.includes(userName);
    });
    return partial?.id ?? null;
}
async function registrarPrestamoDevolucion(materialId, responsableId, cantidad, comentarios, responsableNombre) {
    const existing = await prisma.prestamo.findFirst({
        where: { materialId, responsableId, estado: 'prestado' },
    });
    if (existing)
        return existing;
    const mat = await prisma.material.findUnique({ where: { id: materialId } });
    if (!mat)
        return null;
    const prestamo = await prisma.prestamo.create({
        data: {
            materialId,
            responsableId,
            cantidad,
            comentarios,
            estado: 'prestado',
        },
    });
    if (mat.stockActual >= cantidad) {
        await prisma.material.update({
            where: { id: materialId },
            data: {
                stockActual: { decrement: cantidad },
                estadoUso: 'EN USO',
                aCargo: responsableNombre,
            },
        });
    }
    else {
        await prisma.material.update({
            where: { id: materialId },
            data: {
                estadoUso: 'EN USO',
                aCargo: responsableNombre,
            },
        });
    }
    return prestamo;
}
/**
 * Al cerrar una instalación, registra préstamos pendientes y notifica a cada encargado
 * de herramienta que debe realizar la devolución.
 */
export async function notificarDevolucionHerramientasInstalacion(params) {
    const materiales = Array.isArray(params.datosInstalacion.materiales)
        ? params.datosInstalacion.materiales
        : [];
    const personalAsignado = Array.isArray(params.datosInstalacion.personalAsignado)
        ? params.datosInstalacion.personalAsignado
        : [];
    const candidatos = materiales.filter((m) => String(m.responsable || '').trim());
    if (candidatos.length === 0)
        return;
    const herramientas = [];
    for (const item of candidatos) {
        const material = await findMaterial(item);
        if (!esHerramientaRegistro(item, material))
            continue;
        herramientas.push({ ...item, materialId: material?.id });
    }
    if (herramientas.length === 0)
        return;
    const porEncargado = new Map();
    for (const h of herramientas) {
        const key = normalizeName(String(h.responsable));
        if (!porEncargado.has(key))
            porEncargado.set(key, []);
        porEncargado.get(key).push(h);
    }
    for (const tools of porEncargado.values()) {
        const responsableNombre = String(tools[0].responsable || '').trim();
        const userId = await resolveUserIdForResponsable(responsableNombre, personalAsignado);
        const toolLabels = [];
        for (const tool of tools) {
            const qty = cantidadMaterial(tool);
            toolLabels.push(`${tool.nombre}${qty > 1 ? ` (x${qty})` : ''}`);
            if (tool.materialId && userId) {
                try {
                    await registrarPrestamoDevolucion(tool.materialId, userId, qty, `Devolución pendiente tras instalación del proyecto ${params.proyectoNombre} [PROYECTO_ID:${params.proyectoId}]`, responsableNombre);
                }
                catch (err) {
                    console.error('[instalacionDevolucion] Error creando préstamo:', err);
                }
            }
        }
        const listaHerramientas = toolLabels.join(', ');
        const message = `La instalación del proyecto "${params.proyectoNombre}" finalizó. Debes devolver: ${listaHerramientas}. [PROYECTO_ID:${params.proyectoId}]`;
        try {
            if (userId) {
                await prisma.notification.create({
                    data: {
                        title: 'Herramienta en devolución',
                        message,
                        userId,
                        createdBy: 'Sistema Luxes',
                    },
                });
                await sendPushToUsers([userId], {
                    title: 'Herramienta en devolución',
                    body: `Debes devolver: ${listaHerramientas} (proyecto ${params.proyectoNombre})`,
                    icon: '/LogoGlobo.png',
                    badge: '/LogoGlobo.png',
                    data: {
                        url: '/devoluciones',
                        proyectoId: params.proyectoId,
                    },
                });
            }
            else {
                await prisma.notification.create({
                    data: {
                        title: 'Herramienta en devolución',
                        message: `${responsableNombre}: ${message}`,
                        rol: 'taller',
                        createdBy: 'Sistema Luxes',
                    },
                });
            }
            console.log(`[Proyecto ${params.proyectoId}] Devolución notificada a ${responsableNombre} (${userId || 'sin usuario vinculado'})`);
        }
        catch (err) {
            console.error('[instalacionDevolucion] Error enviando notificación:', err);
        }
    }
}
