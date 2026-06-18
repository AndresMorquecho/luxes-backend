import webpush from 'web-push';
import { env } from '../../../../../config/env.js';
// Configure VAPID details for Web Push
if (env.vapidPublicKey && env.vapidPrivateKey) {
    webpush.setVapidDetails(env.vapidEmail, env.vapidPublicKey, env.vapidPrivateKey);
}
export class PrismaComprasAdapter {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    // ── Proveedores ────────────────────────────────────────────────────────────
    async findAllProveedores() {
        const rows = await this.prisma.proveedor.findMany({
            orderBy: { nombre: 'asc' },
        });
        return rows;
    }
    async createProveedor(data) {
        const row = await this.prisma.proveedor.create({ data });
        return row;
    }
    async updateProveedor(id, data) {
        const row = await this.prisma.proveedor.update({ where: { id }, data });
        return row;
    }
    async deleteProveedor(id) {
        await this.prisma.proveedor.delete({ where: { id } });
    }
    // ── Órdenes de Compra ──────────────────────────────────────────────────────
    ordenInclude = {
        proveedor: true,
        usuario: { select: { id: true, nombre: true, email: true } },
        aprobadoPor: { select: { id: true, nombre: true, email: true } },
        detalles: true,
        abonos: { include: { metodoPago: true }, orderBy: { fecha: 'desc' } },
        cuentaPorPagar: true,
        proyecto: { select: { id: true, nombre: true } },
    };
    async findAllOrdenes(options) {
        const { page = 1, limit = 10, search, estado, estadoPago } = options || {};
        const where = {};
        if (estado)
            where.estado = estado;
        if (estadoPago)
            where.estadoPago = estadoPago;
        if (search) {
            where.OR = [
                { numero: { contains: search, mode: 'insensitive' } },
                { proveedor: { nombre: { contains: search, mode: 'insensitive' } } },
                { concepto: { contains: search, mode: 'insensitive' } },
                { notas: { contains: search, mode: 'insensitive' } },
                { usuario: { nombre: { contains: search, mode: 'insensitive' } } },
            ];
        }
        const skip = (page - 1) * limit;
        const [rows, total] = await Promise.all([
            this.prisma.ordenCompra.findMany({
                where,
                include: this.ordenInclude,
                orderBy: { fechaCreacion: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.ordenCompra.count({ where }),
        ]);
        return {
            items: rows,
            total,
        };
    }
    async findOrdenById(id) {
        const row = await this.prisma.ordenCompra.findUnique({
            where: { id },
            include: this.ordenInclude,
        });
        return row;
    }
    async getNextOrdenNumero() {
        const year = new Date().getFullYear();
        const suffix = `_${year}`;
        const last = await this.prisma.ordenCompra.findFirst({
            where: {
                numero: { endsWith: suffix },
            },
            orderBy: { numero: 'desc' },
            select: { numero: true },
        });
        if (!last)
            return `ORC_001_${year}`;
        const parts = last.numero.split('_');
        const num = parseInt(parts[1], 10);
        return `ORC_${String(num + 1).padStart(3, '0')}_${year}`;
    }
    async createOrden(data) {
        const numero = await this.getNextOrdenNumero();
        // Mapear detalles - PRECIOS OPCIONALES
        const detallesData = (data.detalles || []).map(d => ({
            descripcion: d.descripcion,
            cantidad: d.cantidad,
            precioUnitario: d.precioUnitario ?? 0, // Default 0 si no se proporciona
            subtotal: d.cantidad * (d.precioUnitario ?? 0),
            materialId: d.materialId || null,
        }));
        const subtotal = detallesData.reduce((sum, d) => sum + d.subtotal, 0);
        const impuesto = data.impuesto || 0;
        const total = subtotal + impuesto;
        // Construir data object - PROVEEDOR OPCIONAL
        const createData = {
            numero,
            usuario: { connect: { id: data.usuarioId } },
            fecha: data.fecha ? new Date(data.fecha) : new Date(),
            subtotal,
            impuesto,
            total,
            concepto: data.concepto || '',
            notas: data.notas || '',
            estado: 'pendiente_aprobacion', // Estado inicial
            detalles: {
                create: detallesData.map(d => ({
                    descripcion: d.descripcion,
                    cantidad: d.cantidad,
                    precioUnitario: d.precioUnitario,
                    subtotal: d.subtotal,
                    materialId: d.materialId,
                })),
            },
        };
        // Solo agregar proyecto si se proporciona
        if (data.proyectoId) {
            createData.proyecto = { connect: { id: data.proyectoId } };
        }
        // Solo agregar proveedor si se proporciona Y no es vacío
        if (data.proveedorId && data.proveedorId.trim() !== '') {
            createData.proveedor = { connect: { id: data.proveedorId } };
        }
        // Solo crear cuenta por pagar si hay valores
        if (total > 0) {
            createData.cuentaPorPagar = {
                create: {
                    montoTotal: total,
                    montoPagado: 0,
                    saldo: total,
                    estado: 'pendiente',
                    fechaVencimiento: data.fechaVencimiento ? new Date(data.fechaVencimiento) : null,
                },
            };
        }
        const row = await this.prisma.ordenCompra.create({
            data: createData,
            include: this.ordenInclude,
        });
        // Generate notification for administrators
        try {
            // Get user name for notification
            const usuario = await this.prisma.user.findUnique({
                where: { id: data.usuarioId },
                select: { nombre: true }
            });
            const notif = await this.prisma.notification.create({
                data: {
                    title: 'Nueva Orden de Compra',
                    message: `Se ha generado la orden de compra ${row.numero} por un valor de $${row.total.toFixed(2)} pendiente de aprobación.`,
                    rol: 'admin',
                    permission: 'aprobacion_ordenes_compra',
                    createdBy: usuario?.nombre || 'Usuario desconocido',
                }
            });
            // Dispatch Web Push Notifications
            // 1. Get all users who have the 'aprobacion_ordenes_compra' permission, or are administrators
            const adminUsers = await this.prisma.user.findMany({
                where: {
                    OR: [
                        { rol: { in: ['admin', 'administrador'] } },
                        {
                            role: {
                                permissions: {
                                    some: {
                                        permission: {
                                            key: 'aprobacion_ordenes_compra'
                                        }
                                    }
                                }
                            }
                        }
                    ]
                },
                include: {
                    pushSubscriptions: true
                }
            });
            // 2. Loop through users and their subscriptions to send push messages
            const pushPayload = JSON.stringify({
                title: notif.title,
                body: notif.message,
                url: '/compras/aprobaciones'
            });
            for (const user of adminUsers) {
                for (const sub of user.pushSubscriptions) {
                    try {
                        const subscriptionParams = {
                            endpoint: sub.endpoint,
                            keys: {
                                p256dh: sub.p256dh,
                                auth: sub.auth
                            }
                        };
                        await webpush.sendNotification(subscriptionParams, pushPayload);
                    }
                    catch (pushErr) {
                        console.error(`[Web Push Error] Failed to send to endpoint ${sub.endpoint}:`, pushErr.message);
                        // If subscription is expired/invalid (404 or 410), delete it from the database
                        if (pushErr.statusCode === 404 || pushErr.statusCode === 410) {
                            await this.prisma.pushSubscription.delete({ where: { endpoint: sub.endpoint } });
                        }
                    }
                }
            }
        }
        catch (err) {
            console.error('[Notification Generation Error]', err);
        }
        return row;
    }
    async updateOrden(id, data) {
        const updateData = {};
        // Solo actualizar proveedor si se proporciona Y no es vacío
        if (data.proveedorId && data.proveedorId.trim() !== '') {
            updateData.proveedor = { connect: { id: data.proveedorId } };
        }
        if (data.fecha)
            updateData.fecha = new Date(data.fecha);
        if (data.estado) {
            updateData.estado = data.estado;
            // Si se está aprobando la orden y viene el usuario aprobador, establecer fecha y usuario
            if (data.estado === 'aprobada' && data.aprobadoPorId) {
                updateData.fechaAprobacion = new Date();
                updateData.aprobadoPor = { connect: { id: data.aprobadoPorId } };
            }
            // Si se está rechazando también poner fecha
            if (data.estado === 'rechazada') {
                updateData.fechaAprobacion = new Date();
            }
        }
        if (data.concepto !== undefined)
            updateData.concepto = data.concepto;
        if (data.notas !== undefined)
            updateData.notas = data.notas;
        if (data.proyectoId !== undefined) {
            if (data.proyectoId) {
                updateData.proyecto = { connect: { id: data.proyectoId } };
            }
            else {
                updateData.proyecto = { disconnect: true };
            }
        }
        if (data.detalles) {
            // Recalculate totals
            const detallesData = data.detalles.map(d => ({
                descripcion: d.descripcion,
                cantidad: d.cantidad,
                precioUnitario: d.precioUnitario,
                subtotal: d.cantidad * d.precioUnitario,
                materialId: d.materialId || undefined,
            }));
            const subtotal = detallesData.reduce((sum, d) => sum + d.subtotal, 0);
            const impuesto = data.impuesto ?? 0;
            const total = subtotal + impuesto;
            updateData.subtotal = subtotal;
            updateData.impuesto = impuesto;
            updateData.total = total;
            // Delete old details and create new ones
            await this.prisma.detalleCompra.deleteMany({ where: { ordenCompraId: id } });
            updateData.detalles = {
                create: detallesData.map(d => ({
                    descripcion: d.descripcion,
                    cantidad: d.cantidad,
                    precioUnitario: d.precioUnitario,
                    subtotal: d.subtotal,
                    ...(d.materialId ? { materialId: d.materialId } : {}),
                })),
            };
            // Update or create CxP
            const cxp = await this.prisma.cuentaPorPagar.findUnique({
                where: { ordenCompraId: id },
            });
            if (total > 0) {
                if (cxp) {
                    await this.prisma.cuentaPorPagar.update({
                        where: { id: cxp.id },
                        data: {
                            montoTotal: total,
                            saldo: total - cxp.montoPagado,
                            estado: cxp.montoPagado >= total ? 'pagado' : cxp.montoPagado > 0 ? 'parcial' : 'pendiente',
                        },
                    });
                }
                else {
                    // Crear cuenta por pagar si no existe
                    updateData.cuentaPorPagar = {
                        create: {
                            montoTotal: total,
                            montoPagado: 0,
                            saldo: total,
                            estado: 'pendiente',
                        },
                    };
                }
            }
        }
        else if (data.impuesto !== undefined) {
            const existing = await this.prisma.ordenCompra.findUnique({
                where: { id },
                select: { subtotal: true },
            });
            if (existing) {
                updateData.impuesto = data.impuesto;
                updateData.total = existing.subtotal + data.impuesto;
            }
        }
        const row = await this.prisma.ordenCompra.update({
            where: { id },
            data: updateData,
            include: this.ordenInclude,
        });
        // Registrar gasto automáticamente si fue aprobada y está ligada a un proyecto
        if (data.estado === 'aprobada' && row.proyectoId) {
            try {
                const provName = row.proveedor?.nombre || 'Proveedor';
                await this.prisma.gasto.create({
                    data: {
                        id: `G-OC-${row.id.slice(-8)}-${Date.now()}`,
                        concepto: `Materiales de Orden de Compra - ${row.numero}`,
                        categoria: 'proyecto',
                        fecha: new Date(),
                        monto: row.total,
                        proveedor: provName,
                        proyectoId: row.proyectoId,
                        notas: row.id, // Guardar el ID de la OC para recuperarla desde el frontend
                    }
                });
                console.log(`[Gasto Automático] Creado gasto de $${row.total} para proyecto ${row.proyectoId} desde OC ${row.numero}`);
            }
            catch (err) {
                console.error('[Gasto Automático Error] No se pudo crear el gasto para el proyecto:', err);
            }
            // Enviar notificación de aprobación al taller
            try {
                const notif = await this.prisma.notification.create({
                    data: {
                        title: 'Orden de Compra Aprobada',
                        message: `La orden de compra ${row.numero} ha sido aprobada.`,
                        rol: 'taller',
                        createdBy: 'Administración',
                    }
                });
                // Obtener usuarios del taller
                const tallerUsers = await this.prisma.user.findMany({
                    where: {
                        OR: [
                            { rol: { in: ['taller'] } },
                            { id: row.usuarioId } // También al emisor original
                        ]
                    },
                    include: {
                        pushSubscriptions: true
                    }
                });
                const pushPayload = JSON.stringify({
                    title: notif.title,
                    body: notif.message,
                    url: `/inventario/recepcion/${row.id}`
                });
                for (const user of tallerUsers) {
                    for (const sub of user.pushSubscriptions) {
                        try {
                            const subscriptionParams = {
                                endpoint: sub.endpoint,
                                keys: {
                                    p256dh: sub.p256dh,
                                    auth: sub.auth
                                }
                            };
                            await webpush.sendNotification(subscriptionParams, pushPayload);
                        }
                        catch (pushErr) {
                            console.error(`[Web Push Error] Failed to send to endpoint ${sub.endpoint}:`, pushErr.message);
                            if (pushErr.statusCode === 404 || pushErr.statusCode === 410) {
                                await this.prisma.pushSubscription.delete({ where: { endpoint: sub.endpoint } });
                            }
                        }
                    }
                }
            }
            catch (err) {
                console.error('[Notification Approval Error]', err);
            }
        }
        return row;
    }
    async deleteOrden(id) {
        await this.prisma.ordenCompra.delete({ where: { id } });
    }
    // ── Abonos ─────────────────────────────────────────────────────────────────
    async findAbonosByOrden(ordenId) {
        const rows = await this.prisma.abonoCompra.findMany({
            where: { ordenCompraId: ordenId },
            include: { metodoPago: true },
            orderBy: { fecha: 'desc' },
        });
        return rows;
    }
    async createAbono(data) {
        const row = await this.prisma.abonoCompra.create({
            data: {
                ordenCompra: { connect: { id: data.ordenCompraId } },
                metodoPago: { connect: { id: data.metodoPagoId } },
                monto: data.monto,
                referencia: data.referencia,
            },
            include: { metodoPago: true },
        });
        return row;
    }
    // ── Cuentas por Pagar ──────────────────────────────────────────────────────
    async findAllCuentasPorPagar(options) {
        const { page = 1, limit = 10, estado } = options || {};
        const where = {};
        if (estado)
            where.estado = estado;
        const skip = (page - 1) * limit;
        const [rows, total] = await Promise.all([
            this.prisma.cuentaPorPagar.findMany({
                where,
                include: {
                    ordenCompra: {
                        include: { proveedor: true },
                    },
                },
                orderBy: { ordenCompra: { fechaCreacion: 'desc' } },
                skip,
                take: limit,
            }),
            this.prisma.cuentaPorPagar.count({ where }),
        ]);
        return {
            items: rows,
            total,
        };
    }
    async updateCuentaPorPagar(id, data) {
        const row = await this.prisma.cuentaPorPagar.update({
            where: { id },
            data,
            include: { ordenCompra: { include: { proveedor: true } } },
        });
        return row;
    }
    // ── Métodos de Pago ────────────────────────────────────────────────────────
    async findAllMetodosPago() {
        const rows = await this.prisma.metodoPago.findMany({
            orderBy: { nombre: 'asc' },
        });
        return rows;
    }
    async createMetodoPago(data) {
        const row = await this.prisma.metodoPago.create({ data });
        return row;
    }
    async updateMetodoPago(id, data) {
        const row = await this.prisma.metodoPago.update({ where: { id }, data });
        return row;
    }
    async deleteMetodoPago(id) {
        await this.prisma.metodoPago.delete({ where: { id } });
    }
    // ── Stats ──────────────────────────────────────────────────────────────────
    async getComprasStats() {
        const [totalOrdenes, pendientes, gastadoResult, deudaResult] = await Promise.all([
            this.prisma.ordenCompra.count(),
            this.prisma.ordenCompra.count({ where: { estado: 'pendiente' } }),
            this.prisma.ordenCompra.aggregate({ _sum: { total: true } }),
            this.prisma.cuentaPorPagar.aggregate({
                _sum: { saldo: true },
                where: { estado: { not: 'pagado' } },
            }),
        ]);
        return {
            totalOrdenes,
            pendientes,
            totalGastado: gastadoResult._sum.total || 0,
            totalDeuda: deudaResult._sum.saldo || 0,
        };
    }
    // ── Inventario Helpers ──
    async adjustMaterialStock(materialId, cantidad) {
        await this.prisma.material.update({
            where: { id: materialId },
            data: {
                stockActual: { increment: cantidad },
            },
        });
    }
    async createMaterialMovimiento(data) {
        await this.prisma.movimientoInventario.create({
            data: {
                materialId: data.materialId,
                tipo: data.tipo,
                cantidad: data.cantidad,
                motivo: data.motivo,
                userId: data.userId || null,
            },
        });
    }
}
