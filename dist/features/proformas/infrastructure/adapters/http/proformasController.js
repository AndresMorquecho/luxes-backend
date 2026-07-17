import { prisma } from '../../../../../config/prismaClient.js';
import { sendPushToRole } from '../../../../../shared/services/pushNotificationService.js';
import { logAuditAction } from '../../../../../shared/services/auditLogService.js';
/** Genera el siguiente ID con formato PRO-### */
async function nextProformaId() {
    const rows = await prisma.proforma.findMany({ select: { id: true } });
    const max = rows.reduce((m, r) => {
        const n = parseInt(String(r.id).replace('PRO-', ''), 10);
        return Number.isFinite(n) && n > m ? n : m;
    }, 0);
    return `PRO-${String(max + 1).padStart(3, '0')}`;
}
const toDateStr = (d) => d ? new Date(d).toISOString().split('T')[0] : '';
const toDateTimeStr = (d) => d ? new Date(d).toISOString() : '';
/**
 * Crea UNA sola notificación en BD por cada rol canónico y envía UN push por rol canónico.
 * Esto evita duplicados: antes se creaba una notif por cada alias ('admin', 'administrador')
 * y la query expandía aliases, por lo que el usuario veía N copias.
 *
 * Roles canónicos: 'admin' (cubre administrador), 'ventas' (cubre diseñador/disenador),
 * 'taller', 'impresión' (cubre impresion).
 */
function canonicalRole(rol) {
    const r = rol.toLowerCase();
    if (r === 'administrador')
        return 'admin';
    if (r === 'diseñador' || r === 'disenador')
        return 'ventas';
    if (r === 'impresion')
        return 'impresión';
    return r;
}
async function notifyRoles(roles, data) {
    // Deduplicar por rol canónico para crear UNA sola notif/push por grupo
    const seen = new Set();
    for (const roleName of roles) {
        const canon = canonicalRole(roleName);
        if (seen.has(canon))
            continue;
        seen.add(canon);
        await prisma.notification.create({
            data: {
                title: data.title,
                message: data.message,
                rol: canon,
                createdBy: data.createdBy,
            },
        });
        if (data.url) {
            await sendPushToRole(canon, {
                title: data.title,
                body: data.message,
                data: { url: data.url },
            }).catch(() => { });
        }
    }
}
async function notifyVentasEquipo(proforma, data) {
    let vendedorUserId = proforma.creadoPorUserId || null;
    if (!vendedorUserId && proforma.atiende) {
        const vendedor = await prisma.user.findFirst({
            where: {
                nombre: { equals: proforma.atiende, mode: 'insensitive' },
            },
            select: { id: true },
        });
        vendedorUserId = vendedor?.id || null;
    }
    let vendedorIsVentas = false;
    if (vendedorUserId) {
        const u = await prisma.user.findUnique({
            where: { id: vendedorUserId },
            select: { rol: true },
        });
        const roleName = u?.rol?.toLowerCase() || '';
        if (roleName === 'ventas' || roleName === 'diseñador' || roleName === 'disenador') {
            vendedorIsVentas = true;
        }
    }
    // 1. Notificación personal al creador/vendedor de la proforma (solo si NO tiene el rol ventas para evitar duplicados)
    if (vendedorUserId && !vendedorIsVentas) {
        await prisma.notification.create({
            data: {
                title: data.title,
                message: data.message,
                userId: vendedorUserId,
                createdBy: data.createdBy,
            },
        });
    }
    // 2. UNA sola notificación por rol para el equipo de ventas (sin aliases duplicados)
    await notifyRoles(['ventas'], {
        ...data,
        url: `/proformas/detalle/${proforma.id}`,
    });
}
/** Mapea el registro Prisma a la forma que consume el frontend */
function mapProforma(p) {
    return {
        id: p.id,
        clienteId: p.clienteId,
        cliente: p.clienteNombre,
        telefono: p.telefono,
        email: p.email,
        fecha: toDateStr(p.fecha),
        vencimiento: p.vencimiento ? toDateStr(p.vencimiento) : '',
        diasValidez: p.diasValidez,
        atiende: p.atiende,
        condiciones: p.condiciones,
        iva: Number(p.iva),
        notas: p.notas,
        estado: p.estado,
        metodoPagoId: p.metodoPagoId,
        metodoPago: p.metodoPago,
        fechaEnvio: toDateStr(p.fechaEnvio),
        fechaAprobacion: toDateTimeStr(p.fechaAprobacion),
        creadoPorUserId: p.creadoPorUserId || null,
        items: (p.items || [])
            .slice()
            .sort((a, b) => a.orden - b.orden)
            .map((i) => ({
            descripcion: i.descripcion,
            cantidad: Number(i.cantidad),
            precioUnitario: Number(i.precioUnitario),
        })),
        abonos: (p.abonos || [])
            .slice()
            .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime())
            .map((ab) => ({
            id: ab.id,
            monto: Number(ab.monto),
            fecha: toDateTimeStr(ab.fecha),
            referencia: ab.referencia,
            metodoPago: ab.metodoPago ? { id: ab.metodoPago.id, nombre: ab.metodoPago.nombre } : null,
            registradoPor: ab.registradoPor ? { id: ab.registradoPor.id, nombre: ab.registradoPor.nombre } : null,
        })),
    };
}
/** Construye los datos de ítems para Prisma a partir del body */
function buildItems(items) {
    return (Array.isArray(items) ? items : []).map((it, idx) => ({
        descripcion: it.descripcion || '',
        cantidad: Number(it.cantidad) || 0,
        precioUnitario: Number(it.precioUnitario) || 0,
        orden: idx,
    }));
}
/** Valida que el clienteId exista; si no, devuelve null para no romper la FK */
async function resolveClienteId(clienteId) {
    if (!clienteId)
        return null;
    const c = await prisma.cliente.findUnique({ where: { id: String(clienteId) } });
    return c ? c.id : null;
}
export class ProformasController {
    async list(req, res) {
        try {
            const { page = '1', limit = '20', search = '', estado = '', fechaDesde = '', fechaHasta = '', clienteId = '', usuario = '', conAbonos = '' } = req.query;
            const pageNum = Math.max(1, parseInt(String(page), 10));
            const limitNum = Math.max(1, Math.min(1000, parseInt(String(limit), 10))); // Permite límites de hasta 1000 para cargas de listados completos en frontend
            const skip = (pageNum - 1) * limitNum;
            // Construir filtros dinámicos
            const where = {};
            const andFilters = [];
            // Incluir proformas vinculadas por clienteId o por nombre (legacy sin FK)
            if (clienteId && String(clienteId).trim()) {
                const cid = String(clienteId).trim();
                const cliente = await prisma.cliente.findUnique({
                    where: { id: cid },
                    select: { nombre: true },
                });
                const clienteOr = [{ clienteId: cid }];
                if (cliente?.nombre) {
                    clienteOr.push({
                        clienteNombre: { equals: cliente.nombre, mode: 'insensitive' },
                    });
                }
                andFilters.push({ OR: clienteOr });
            }
            // Excluir rechazadas por defecto a menos que se busque específicamente
            if (estado && String(estado).trim()) {
                const estStr = String(estado).trim();
                if (estStr === 'Aprobada') {
                    where.estado = { in: ['Aprobada', 'Pagada'] };
                }
                else if (estStr.includes(',')) {
                    where.estado = { in: estStr.split(',').map(s => s.trim()) };
                }
                else {
                    where.estado = estStr;
                }
            }
            // Búsqueda por texto (cliente, ID, teléfono, email)
            if (search && String(search).trim()) {
                const searchTerm = String(search).trim();
                andFilters.push({
                    OR: [
                        { clienteNombre: { contains: searchTerm, mode: 'insensitive' } },
                        { id: { contains: searchTerm, mode: 'insensitive' } },
                        { telefono: { contains: searchTerm } },
                        { email: { contains: searchTerm, mode: 'insensitive' } },
                    ],
                });
            }
            if (andFilters.length > 0) {
                where.AND = andFilters;
            }
            if (conAbonos === 'true') {
                where.abonos = { some: { monto: { gt: 0 } } };
            }
            // Filtro por rango de fechas
            if (fechaDesde || fechaHasta) {
                where.fecha = {};
                if (fechaDesde) {
                    const desdeStr = String(fechaDesde);
                    where.fecha.gte = desdeStr.includes('T') ? new Date(desdeStr) : new Date(desdeStr + 'T00:00:00');
                }
                if (fechaHasta) {
                    // Incluir todo el día hasta las 23:59:59
                    const hastaStr = String(fechaHasta);
                    where.fecha.lte = hastaStr.includes('T') ? new Date(hastaStr) : new Date(hastaStr + 'T23:59:59.999');
                }
            }
            // Ejecutar consulta con paginación
            const [proformas, total] = await Promise.all([
                prisma.proforma.findMany({
                    where,
                    include: { items: true, metodoPago: true, abonos: { include: { metodoPago: true, registradoPor: true } } },
                    orderBy: { fecha: 'desc' },
                    skip,
                    take: limitNum,
                }),
                prisma.proforma.count({ where }),
            ]);
            return res.status(200).json({
                success: true,
                data: proformas.map(mapProforma),
                pagination: {
                    page: pageNum,
                    limit: limitNum,
                    total,
                    totalPages: Math.ceil(total / limitNum),
                }
            });
        }
        catch (error) {
            console.error('[proformas/list]', error);
            return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al obtener proformas' } });
        }
    }
    async create(req, res) {
        try {
            const b = req.body || {};
            const id = await nextProformaId();
            const clienteId = await resolveClienteId(b.clienteId);
            const creadoPorUserId = req.user?.id || null;
            const created = await prisma.proforma.create({
                data: {
                    id,
                    clienteId,
                    clienteNombre: b.cliente ?? b.clienteNombre ?? '',
                    telefono: b.telefono ?? '',
                    email: b.email ?? '',
                    fecha: b.fecha ? new Date(b.fecha + (String(b.fecha).includes('T') ? '' : 'T12:00:00')) : new Date(),
                    vencimiento: b.vencimiento ? new Date(b.vencimiento + (String(b.vencimiento).includes('T') ? '' : 'T12:00:00')) : null,
                    diasValidez: Number(b.diasValidez ?? 3),
                    atiende: b.atiende ?? req.user?.nombre ?? '',
                    condiciones: b.condiciones ?? '',
                    iva: Number(b.iva ?? 0.12),
                    notas: b.notas ?? '',
                    estado: b.estado ?? 'Pendiente',
                    metodoPagoId: b.metodoPagoId || null,
                    creadoPorUserId,
                    items: { create: buildItems(b.items) },
                },
                include: { items: true, metodoPago: true },
            });
            // Generar notificaciones para los administradores si la proforma se crea en estado Pendiente
            if (created.estado === 'Pendiente') {
                try {
                    const subtotal = created.items.reduce((s, item) => s + (Number(item.cantidad) * Number(item.precioUnitario)), 0);
                    const totalVal = subtotal * (1 + Number(created.iva));
                    const createdByNom = req.user?.nombre || created.atiende || 'Sistema';
                    await notifyRoles(['admin', 'administrador'], {
                        title: 'Nueva Proforma Pendiente de Aprobación',
                        message: `Se ha generado la proforma ${created.id} para el cliente "${created.clienteNombre}" por un total de $${totalVal.toFixed(2)}. Requiere aprobación.`,
                        createdBy: createdByNom,
                        url: `/proformas/detalle/${created.id}`,
                    });
                }
                catch (notifErr) {
                    console.error('[proformas/create/notify]', notifErr);
                }
            }
            return res.status(201).json({ success: true, data: mapProforma(created) });
        }
        catch (error) {
            console.error('[proformas/create]', error);
            return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al crear proforma' } });
        }
    }
    async update(req, res) {
        try {
            const { id } = req.params;
            const b = req.body || {};
            const clienteId = await resolveClienteId(b.clienteId);
            // Obtener el estado actual antes de la actualización para detectar si estaba rechazada
            const existingProforma = await prisma.proforma.findUnique({
                where: { id: String(id) },
                select: { estado: true }
            });
            if (!existingProforma) {
                return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Proforma no encontrada' } });
            }
            const userRole = (req.user?.rol || '').toUpperCase();
            const isAdmin = userRole === 'ADMIN' || userRole === 'ADMINISTRADOR';
            const isVentasODisenador = ['VENTAS', 'DISEÑADOR', 'DISENADOR'].includes(userRole);
            if (!isAdmin) {
                if (!isVentasODisenador) {
                    return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No tienes permiso para editar proformas' } });
                }
                if (existingProforma.estado !== 'Rechazada') {
                    return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Solo se pueden editar proformas en estado Rechazada' } });
                }
            }
            // Reemplazamos los ítems por completo en una sola transacción anidada
            const updated = await prisma.proforma.update({
                where: { id: String(id) },
                data: {
                    clienteId,
                    clienteNombre: b.cliente ?? b.clienteNombre ?? '',
                    telefono: b.telefono ?? '',
                    email: b.email ?? '',
                    fecha: b.fecha ? new Date(String(b.fecha).includes('T') ? b.fecha : `${b.fecha}T12:00:00`) : undefined,
                    vencimiento: b.vencimiento ? new Date(String(b.vencimiento).includes('T') ? b.vencimiento : `${b.vencimiento}T12:00:00`) : null,
                    diasValidez: Number(b.diasValidez ?? 3),
                    atiende: b.atiende ?? '',
                    condiciones: b.condiciones ?? '',
                    iva: Number(b.iva ?? 0.12),
                    notas: b.notas ?? '',
                    estado: b.estado ?? 'Pendiente',
                    metodoPagoId: b.metodoPagoId || null,
                    items: {
                        deleteMany: {},
                        create: buildItems(b.items),
                    },
                },
                include: { items: true, metodoPago: true },
            });
            const mappedUpdated = mapProforma(updated);
            // Cascade update to ProyectoFase
            const fases = await prisma.proyectoFase.findMany({
                where: {
                    fase: 'COTIZACION',
                    datos: { contains: String(id) },
                },
            });
            for (const fase of fases) {
                try {
                    const datosParsed = JSON.parse(fase.datos);
                    if (Array.isArray(datosParsed.cotizacionesSeleccionadas)) {
                        let modified = false;
                        datosParsed.cotizacionesSeleccionadas = datosParsed.cotizacionesSeleccionadas.map((c) => {
                            if (c.id === String(id)) {
                                modified = true;
                                const subtotal = updated.items.reduce((acc, item) => acc + (Number(item.cantidad) * Number(item.precioUnitario)), 0);
                                const total = subtotal * (1 + Number(updated.iva));
                                return {
                                    ...c,
                                    cliente: mappedUpdated.cliente,
                                    fecha: mappedUpdated.fecha,
                                    estado: mappedUpdated.estado,
                                    total: total,
                                    items: mappedUpdated.items
                                };
                            }
                            return c;
                        });
                        if (modified) {
                            await prisma.proyectoFase.update({
                                where: { id: fase.id },
                                data: { datos: JSON.stringify(datosParsed) },
                            });
                        }
                    }
                }
                catch (e) {
                    console.error(`Error actualizando fase ${fase.id}:`, e);
                }
            }
            // Si la proforma estaba Rechazada y ahora pasa a Pendiente
            if (existingProforma?.estado === 'Rechazada' && updated.estado === 'Pendiente') {
                try {
                    const subtotal = updated.items.reduce((s, item) => s + (Number(item.cantidad) * Number(item.precioUnitario)), 0);
                    const totalVal = subtotal * (1 + Number(updated.iva));
                    const createdByNom = req.user?.nombre || updated.atiende || 'Sistema';
                    await notifyRoles(['admin', 'administrador'], {
                        title: 'Proforma Re-enviada para Aprobación',
                        message: `La proforma rechazada ${updated.id} para el cliente "${updated.clienteNombre}" ha sido editada y re-enviada para aprobación. Total: $${totalVal.toFixed(2)}.`,
                        createdBy: createdByNom,
                        url: `/proformas/detalle/${updated.id}`,
                    });
                }
                catch (notifErr) {
                    console.error('[proformas/update/notify]', notifErr);
                }
            }
            return res.status(200).json({ success: true, data: mappedUpdated });
        }
        catch (error) {
            console.error('[proformas/update]', error);
            return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al actualizar proforma' } });
        }
    }
    async updateEstado(req, res) {
        try {
            const { id } = req.params;
            const { estado, metodoPagoId } = req.body || {};
            const userRole = (req.user?.rol || '').toUpperCase();
            const isAdmin = userRole === 'ADMIN' || userRole === 'ADMINISTRADOR';
            const estadoStr = String(estado || '');
            if ((estadoStr === 'Aprobada' || estadoStr === 'Pagada' || estadoStr === 'Rechazada') && !isAdmin) {
                return res.status(403).json({
                    success: false,
                    error: { code: 'FORBIDDEN', message: 'Solo administradores pueden cambiar a ese estado' },
                });
            }
            const updated = await prisma.proforma.update({
                where: { id: String(id) },
                data: {
                    estado: String(estado),
                    ...(metodoPagoId !== undefined && { metodoPagoId: metodoPagoId || null })
                },
                include: { items: true, metodoPago: true, abonos: { include: { metodoPago: true, registradoPor: true } } },
            });
            let accionAuditoria = 'Cambiar estado de proforma';
            if (estadoStr === 'Aprobada' || estadoStr === 'Pagada') {
                accionAuditoria = estadoStr === 'Pagada' ? 'Aprobar y pagar proforma' : 'Aprobar proforma';
            }
            else if (estadoStr === 'Rechazada') {
                accionAuditoria = 'Rechazar proforma';
            }
            await logAuditAction({
                userId: req.user?.id,
                accion: accionAuditoria,
                modulo: 'Proformas',
                detalle: `PATCH /api/proformas/${id}/estado — ${updated.id} — Cliente: "${updated.clienteNombre}" — Estado: ${estadoStr}`,
            });
            return res.status(200).json({ success: true, data: mapProforma(updated) });
        }
        catch (error) {
            console.error('[proformas/updateEstado]', error);
            return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al actualizar estado' } });
        }
    }
    async getById(req, res) {
        try {
            const { id } = req.params;
            const proforma = await prisma.proforma.findUnique({
                where: { id: String(id) },
                include: {
                    items: true,
                    metodoPago: true,
                    abonos: {
                        include: { metodoPago: true, registradoPor: true }
                    }
                }
            });
            if (!proforma) {
                return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Proforma no encontrada' } });
            }
            return res.status(200).json({ success: true, data: mapProforma(proforma) });
        }
        catch (error) {
            console.error('[proformas/getById]', error);
            return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al obtener proforma' } });
        }
    }
    async aprobar(req, res) {
        try {
            const { id } = req.params;
            const b = req.body || {};
            const { monto, metodoPagoId, referencia, aplicarIva } = b;
            const userRole = (req.user?.rol || '').toUpperCase();
            const isAdmin = userRole === 'ADMIN' || userRole === 'ADMINISTRADOR';
            if (!isAdmin) {
                return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Solo los administradores pueden aprobar proformas' } });
            }
            if (monto === undefined || !metodoPagoId) {
                return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Monto y método de pago (caja) son requeridos para aprobar la proforma' } });
            }
            const proforma = await prisma.proforma.findUnique({
                where: { id: String(id) },
                include: { items: true },
            });
            if (!proforma) {
                return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Proforma no encontrada' } });
            }
            if (proforma.estado === 'Aprobada' || proforma.estado === 'Pagada') {
                return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Esta proforma ya fue aprobada previamente' } });
            }
            let ivaToApply = proforma.iva;
            if (aplicarIva !== undefined) {
                ivaToApply = new proforma.iva.constructor(aplicarIva ? 0.15 : 0);
            }
            // Calcular total de la proforma
            const subtotal = proforma.items.reduce((s, item) => s + (Number(item.cantidad) * Number(item.precioUnitario)), 0);
            const total = subtotal * (1 + Number(ivaToApply));
            // Validar monto
            const abonoMonto = Number(monto);
            if (abonoMonto < 0) {
                return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'El monto del abono no puede ser negativo' } });
            }
            if (total > 0 && abonoMonto > (total + 0.01)) {
                return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'El abono no puede superar el total de la proforma' } });
            }
            // Transacción para guardar abono y actualizar estado de la proforma
            const nuevoEstado = abonoMonto >= (total - 0.01) ? 'Pagada' : 'Aprobada';
            const result = await prisma.$transaction(async (tx) => {
                const registradoPorUserId = req.user?.id || null;
                // 1. Crear el abono incluso si es 0, para que quede registro
                await tx.abonoProforma.create({
                    data: {
                        proformaId: proforma.id,
                        metodoPagoId: String(metodoPagoId),
                        monto: abonoMonto,
                        referencia: referencia ?? '',
                        registradoPorUserId: registradoPorUserId ?? undefined,
                    },
                });
                // 2. Actualizar la proforma
                const updated = await tx.proforma.update({
                    where: { id: proforma.id },
                    data: {
                        estado: nuevoEstado,
                        metodoPagoId: String(metodoPagoId),
                        fechaAprobacion: new Date(),
                        iva: ivaToApply,
                    },
                    include: { items: true, metodoPago: true, abonos: { include: { metodoPago: true, registradoPor: true } } },
                });
                return updated;
            });
            const adminNombre = req.user?.nombre || 'Administración';
            await notifyVentasEquipo(result, {
                title: 'Proforma Aprobada',
                message: `La proforma ${result.id} para "${result.clienteNombre}" fue aprobada (${nuevoEstado}).`,
                createdBy: adminNombre,
            });
            await logAuditAction({
                userId: req.user?.id,
                accion: nuevoEstado === 'Pagada' ? 'Aprobar y pagar proforma' : 'Aprobar proforma',
                modulo: 'Proformas',
                detalle: `POST /api/proformas/${id}/aprobar — ${result.id} — Cliente: "${result.clienteNombre}" — Abono: $${abonoMonto.toFixed(2)} — Estado: ${nuevoEstado}`,
            });
            return res.status(200).json({ success: true, data: mapProforma(result) });
        }
        catch (error) {
            console.error('[proformas/aprobar]', error);
            return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al aprobar proforma' } });
        }
    }
    async rechazar(req, res) {
        try {
            const { id } = req.params;
            const userRole = (req.user?.rol || '').toUpperCase();
            const isAdmin = userRole === 'ADMIN' || userRole === 'ADMINISTRADOR';
            if (!isAdmin) {
                return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Solo los administradores pueden rechazar proformas' } });
            }
            const proforma = await prisma.proforma.findUnique({
                where: { id: String(id) },
            });
            if (!proforma) {
                return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Proforma no encontrada' } });
            }
            if (proforma.estado === 'Aprobada' || proforma.estado === 'Pagada' || proforma.estado === 'Rechazada') {
                return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: `No se puede rechazar una proforma en estado ${proforma.estado}` } });
            }
            const updated = await prisma.proforma.update({
                where: { id: proforma.id },
                data: { estado: 'Rechazada' },
                include: { items: true, metodoPago: true, abonos: { include: { metodoPago: true, registradoPor: true } } },
            });
            const adminNombre = req.user?.nombre || 'Administración';
            await notifyVentasEquipo(updated, {
                title: 'Proforma Rechazada',
                message: `La proforma ${updated.id} para "${updated.clienteNombre}" fue rechazada.`,
                createdBy: adminNombre,
            });
            await logAuditAction({
                userId: req.user?.id,
                accion: 'Rechazar proforma',
                modulo: 'Proformas',
                detalle: `POST /api/proformas/${id}/rechazar — ${updated.id} — Cliente: "${updated.clienteNombre}"`,
                severidad: 'Warning',
            });
            return res.status(200).json({ success: true, data: mapProforma(updated) });
        }
        catch (error) {
            console.error('[proformas/rechazar]', error);
            return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al rechazar proforma' } });
        }
    }
    async registrarAbono(req, res) {
        try {
            const { id } = req.params;
            const b = req.body || {};
            const { monto, metodoPagoId, referencia } = b;
            if (monto === undefined || !metodoPagoId) {
                return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Monto y método de pago son requeridos' } });
            }
            const proforma = await prisma.proforma.findUnique({
                where: { id: String(id) },
                include: { items: true, abonos: true },
            });
            if (!proforma) {
                return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Proforma no encontrada' } });
            }
            if (proforma.estado !== 'Aprobada' && proforma.estado !== 'Pagada') {
                return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Solo se pueden registrar abonos en proformas aprobadas o pagadas' } });
            }
            // Calcular total de la proforma
            const subtotal = proforma.items.reduce((s, item) => s + (Number(item.cantidad) * Number(item.precioUnitario)), 0);
            const total = subtotal * (1 + Number(proforma.iva));
            // Calcular cuánto se ha pagado hasta ahora
            const yaCobrado = proforma.abonos.reduce((s, ab) => s + Number(ab.monto), 0);
            const pendiente = total - yaCobrado;
            const abonoMonto = Number(monto);
            if (abonoMonto <= 0) {
                return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'El monto del abono debe ser mayor a cero' } });
            }
            if (pendiente > 0 && abonoMonto > (pendiente + 0.01)) {
                return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: `El abono de $${abonoMonto} supera el saldo pendiente de $${pendiente.toFixed(2)}` } });
            }
            const nuevoEstado = (yaCobrado + abonoMonto) >= (total - 0.01) ? 'Pagada' : 'Aprobada';
            const result = await prisma.$transaction(async (tx) => {
                const registradoPorUserId = req.user?.id || null;
                // 1. Crear el abono
                await tx.abonoProforma.create({
                    data: {
                        proformaId: proforma.id,
                        metodoPagoId: String(metodoPagoId),
                        monto: abonoMonto,
                        referencia: referencia ?? '',
                        registradoPorUserId: registradoPorUserId ?? undefined,
                    },
                });
                // 2. Actualizar la proforma
                const updated = await tx.proforma.update({
                    where: { id: proforma.id },
                    data: {
                        estado: nuevoEstado,
                    },
                    include: { items: true, metodoPago: true, abonos: { include: { metodoPago: true, registradoPor: true } } },
                });
                return updated;
            });
            return res.status(200).json({ success: true, data: mapProforma(result) });
        }
        catch (error) {
            console.error('[proformas/registrarAbono]', error);
            return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al registrar abono' } });
        }
    }
    async editarAbono(req, res) {
        try {
            const { id, abonoId } = req.params;
            const b = req.body || {};
            const { monto, metodoPagoId, referencia } = b;
            const userRole = (req.user?.rol || '').toUpperCase();
            const isAdmin = userRole === 'ADMIN' || userRole === 'ADMINISTRADOR';
            if (!isAdmin) {
                return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Solo los administradores pueden editar abonos' } });
            }
            if (monto === undefined || !metodoPagoId) {
                return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Monto y método de pago son requeridos' } });
            }
            const proforma = await prisma.proforma.findUnique({
                where: { id: String(id) },
                include: { items: true, abonos: { include: { metodoPago: true, registradoPor: true } } },
            });
            if (!proforma) {
                return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Proforma no encontrada' } });
            }
            if (proforma.abonos.length === 0) {
                return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'No existen abonos registrados en esta proforma' } });
            }
            const abonosSorted = proforma.abonos.slice().sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
            const lastAbono = abonosSorted[abonosSorted.length - 1];
            if (lastAbono.id !== String(abonoId)) {
                return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Solo se puede editar el último abono registrado' } });
            }
            const subtotal = proforma.items.reduce((s, item) => s + (Number(item.cantidad) * Number(item.precioUnitario)), 0);
            const total = subtotal * (1 + Number(proforma.iva));
            const sumOtrosAbonos = abonosSorted.slice(0, -1).reduce((s, ab) => s + Number(ab.monto), 0);
            const nuevoMonto = Number(monto);
            if (nuevoMonto <= 0) {
                return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'El monto del abono debe ser mayor a cero' } });
            }
            const maxPermitted = total - sumOtrosAbonos;
            if (maxPermitted > 0 && nuevoMonto > (maxPermitted + 0.01)) {
                return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: `El abono de $${nuevoMonto} supera el saldo pendiente de $${maxPermitted.toFixed(2)}` } });
            }
            const nuevoEstado = (sumOtrosAbonos + nuevoMonto) >= (total - 0.01) ? 'Pagada' : 'Aprobada';
            const result = await prisma.$transaction(async (tx) => {
                const registradoPorUserId = req.user?.id || null;
                await tx.abonoProforma.update({
                    where: { id: lastAbono.id },
                    data: {
                        monto: nuevoMonto,
                        metodoPagoId: String(metodoPagoId),
                        referencia: referencia ?? '',
                        registradoPorUserId: registradoPorUserId ?? undefined,
                    },
                });
                const updated = await tx.proforma.update({
                    where: { id: proforma.id },
                    data: {
                        estado: nuevoEstado,
                    },
                    include: { items: true, metodoPago: true, abonos: { include: { metodoPago: true, registradoPor: true } } },
                });
                return updated;
            });
            return res.status(200).json({ success: true, data: mapProforma(result) });
        }
        catch (error) {
            console.error('[proformas/editarAbono]', error);
            return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al editar abono' } });
        }
    }
    async eliminarAbono(req, res) {
        try {
            const { id, abonoId } = req.params;
            const userRole = (req.user?.rol || '').toUpperCase();
            const isAdmin = userRole === 'ADMIN' || userRole === 'ADMINISTRADOR';
            if (!isAdmin) {
                return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Solo los administradores pueden eliminar abonos' } });
            }
            const proforma = await prisma.proforma.findUnique({
                where: { id: String(id) },
                include: { items: true, abonos: { include: { metodoPago: true, registradoPor: true } } },
            });
            if (!proforma) {
                return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Proforma no encontrada' } });
            }
            if (proforma.abonos.length === 0) {
                return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'No existen abonos registrados en esta proforma' } });
            }
            const abonosSorted = proforma.abonos.slice().sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
            const lastAbono = abonosSorted[abonosSorted.length - 1];
            if (lastAbono.id !== String(abonoId)) {
                return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Solo se puede eliminar el último abono registrado' } });
            }
            const subtotal = proforma.items.reduce((s, item) => s + (Number(item.cantidad) * Number(item.precioUnitario)), 0);
            const total = subtotal * (1 + Number(proforma.iva));
            const sumOtrosAbonos = abonosSorted.slice(0, -1).reduce((s, ab) => s + Number(ab.monto), 0);
            const nuevoEstado = sumOtrosAbonos >= (total - 0.01) ? 'Pagada' : 'Aprobada';
            const result = await prisma.$transaction(async (tx) => {
                await tx.abonoProforma.delete({
                    where: { id: lastAbono.id },
                });
                const updated = await tx.proforma.update({
                    where: { id: proforma.id },
                    data: {
                        estado: nuevoEstado,
                    },
                    include: { items: true, metodoPago: true, abonos: { include: { metodoPago: true, registradoPor: true } } },
                });
                return updated;
            });
            return res.status(200).json({ success: true, data: mapProforma(result) });
        }
        catch (error) {
            console.error('[proformas/eliminarAbono]', error);
            return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al eliminar abono' } });
        }
    }
    async enviar(req, res) {
        try {
            const { id } = req.params;
            const proforma = await prisma.proforma.findUnique({
                where: { id: String(id) },
                include: { items: true },
            });
            if (!proforma) {
                return res.status(404).json({
                    success: false,
                    error: { code: 'NOT_FOUND', message: 'Proforma no encontrada' },
                });
            }
            const updated = await prisma.proforma.update({
                where: { id: String(id) },
                data: { fechaEnvio: new Date() },
                include: { items: true, metodoPago: true, abonos: { include: { metodoPago: true, registradoPor: true } } },
            });
            const subtotal = (updated.items || []).reduce((s, item) => s + Number(item.cantidad) * Number(item.precioUnitario), 0);
            const total = subtotal * (1 + Number(updated.iva));
            return res.status(200).json({
                success: true,
                data: {
                    ...mapProforma(updated),
                    resumenEnvio: {
                        cliente: updated.clienteNombre,
                        telefono: updated.telefono,
                        email: updated.email,
                        total: total.toFixed(2),
                        items: updated.items.length,
                    },
                },
            });
        }
        catch (error) {
            console.error('[proformas/enviar]', error);
            return res.status(500).json({
                success: false,
                error: { code: 'INTERNAL_ERROR', message: 'Error al registrar envío de proforma' },
            });
        }
    }
    async remove(req, res) {
        try {
            const { id } = req.params;
            const userRole = (req.user?.rol || '').toUpperCase();
            const isAdmin = userRole === 'ADMIN' || userRole === 'ADMINISTRADOR';
            if (!isAdmin) {
                return res.status(403).json({
                    success: false,
                    error: { code: 'FORBIDDEN', message: 'Solo los administradores pueden eliminar proformas' },
                });
            }
            // 1. Cascade delete in ProyectoFase
            const fases = await prisma.proyectoFase.findMany({
                where: {
                    fase: 'COTIZACION',
                    datos: { contains: String(id) },
                },
            });
            for (const fase of fases) {
                try {
                    const datosParsed = JSON.parse(fase.datos);
                    if (Array.isArray(datosParsed.cotizacionesSeleccionadas)) {
                        const inicial = datosParsed.cotizacionesSeleccionadas.length;
                        datosParsed.cotizacionesSeleccionadas = datosParsed.cotizacionesSeleccionadas.filter((c) => c.id !== String(id));
                        if (datosParsed.cotizacionesSeleccionadas.length !== inicial) {
                            await prisma.proyectoFase.update({
                                where: { id: fase.id },
                                data: { datos: JSON.stringify(datosParsed) },
                            });
                        }
                    }
                }
                catch (e) {
                    console.error(`Error procesando fase ${fase.id}:`, e);
                }
            }
            // 2. Delete proforma
            await prisma.proforma.delete({ where: { id: String(id) } });
            return res.status(200).json({ success: true, data: { id } });
        }
        catch (error) {
            console.error('[proformas/remove]', error);
            return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al eliminar proforma' } });
        }
    }
}
