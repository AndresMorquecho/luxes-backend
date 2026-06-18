import { prisma } from '../../../../../config/prismaClient.js';
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
        items: (p.items || [])
            .slice()
            .sort((a, b) => a.orden - b.orden)
            .map((i) => ({
            descripcion: i.descripcion,
            cantidad: Number(i.cantidad),
            precioUnitario: Number(i.precioUnitario),
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
            const { page = '1', limit = '20', search = '', estado = '', fechaDesde = '', fechaHasta = '' } = req.query;
            const pageNum = Math.max(1, parseInt(String(page), 10));
            const limitNum = Math.max(1, Math.min(100, parseInt(String(limit), 10)));
            const skip = (pageNum - 1) * limitNum;
            // Construir filtros dinámicos
            const where = {};
            // Excluir rechazadas por defecto a menos que se busque específicamente
            if (estado && String(estado).trim()) {
                where.estado = String(estado).trim();
            }
            else {
                where.estado = { not: 'Rechazada' };
            }
            // Búsqueda por texto (cliente, ID, teléfono, email)
            if (search && String(search).trim()) {
                const searchTerm = String(search).trim();
                where.OR = [
                    { clienteNombre: { contains: searchTerm, mode: 'insensitive' } },
                    { id: { contains: searchTerm, mode: 'insensitive' } },
                    { telefono: { contains: searchTerm } },
                    { email: { contains: searchTerm, mode: 'insensitive' } },
                ];
            }
            // Filtro por rango de fechas
            if (fechaDesde || fechaHasta) {
                where.fecha = {};
                if (fechaDesde) {
                    where.fecha.gte = new Date(String(fechaDesde));
                }
                if (fechaHasta) {
                    // Incluir todo el día hasta las 23:59:59
                    const hasta = new Date(String(fechaHasta));
                    hasta.setHours(23, 59, 59, 999);
                    where.fecha.lte = hasta;
                }
            }
            // Ejecutar consulta con paginación
            const [proformas, total] = await Promise.all([
                prisma.proforma.findMany({
                    where,
                    include: { items: true, metodoPago: true },
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
            const created = await prisma.proforma.create({
                data: {
                    id,
                    clienteId,
                    clienteNombre: b.cliente ?? b.clienteNombre ?? '',
                    telefono: b.telefono ?? '',
                    email: b.email ?? '',
                    fecha: b.fecha ? new Date(b.fecha) : new Date(),
                    vencimiento: b.vencimiento ? new Date(b.vencimiento) : null,
                    diasValidez: Number(b.diasValidez ?? 3),
                    atiende: b.atiende ?? '',
                    condiciones: b.condiciones ?? '',
                    iva: Number(b.iva ?? 0.12),
                    notas: b.notas ?? '',
                    estado: b.estado ?? 'Pendiente',
                    metodoPagoId: b.metodoPagoId || null,
                    items: { create: buildItems(b.items) },
                },
                include: { items: true, metodoPago: true },
            });
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
            // Reemplazamos los ítems por completo en una sola transacción anidada
            const updated = await prisma.proforma.update({
                where: { id: String(id) },
                data: {
                    clienteId,
                    clienteNombre: b.cliente ?? b.clienteNombre ?? '',
                    telefono: b.telefono ?? '',
                    email: b.email ?? '',
                    fecha: b.fecha ? new Date(b.fecha) : undefined,
                    vencimiento: b.vencimiento ? new Date(b.vencimiento) : null,
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
            return res.status(200).json({ success: true, data: mapProforma(updated) });
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
            const updated = await prisma.proforma.update({
                where: { id: String(id) },
                data: {
                    estado: String(estado),
                    ...(metodoPagoId !== undefined && { metodoPagoId: metodoPagoId || null })
                },
                include: { items: true, metodoPago: true },
            });
            return res.status(200).json({ success: true, data: mapProforma(updated) });
        }
        catch (error) {
            console.error('[proformas/updateEstado]', error);
            return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al actualizar estado' } });
        }
    }
    async remove(req, res) {
        try {
            const { id } = req.params;
            await prisma.proforma.delete({ where: { id: String(id) } });
            return res.status(200).json({ success: true, data: { id } });
        }
        catch (error) {
            console.error('[proformas/remove]', error);
            return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al eliminar proforma' } });
        }
    }
}
