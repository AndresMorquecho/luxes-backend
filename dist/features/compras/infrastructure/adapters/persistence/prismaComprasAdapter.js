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
        usuario: { select: { id: true, nombre: true, email: true, rol: true } },
        aprobadoPor: { select: { id: true, nombre: true, email: true, rol: true } },
        recibidoPor: { select: { id: true, nombre: true, email: true, rol: true } },
        detalles: { orderBy: { id: 'asc' } },
        abonos: { include: { metodoPago: true }, orderBy: { fecha: 'desc' } },
        cuentaPorPagar: true,
        proyecto: { select: { id: true, nombre: true } },
    };
    async findAllOrdenes(options) {
        const { page = 1, limit = 10, search, estado, estados, estadoPago, proveedorId, creadorRol, creadorId, pendienteRecepcion, proyectoId, } = options || {};
        const where = {};
        if (proyectoId) {
            where.proyectoId = proyectoId;
        }
        if (proveedorId) {
            where.proveedorId = proveedorId;
        }
        if (pendienteRecepcion) {
            where.estado = { in: ['aprobada', 'parcialmente_recibida'] };
        }
        else if (estados?.length) {
            where.estado = { in: estados };
        }
        else if (estado) {
            where.estado = estado;
        }
        if (estadoPago)
            where.estadoPago = estadoPago;
        if (creadorId)
            where.usuarioId = creadorId;
        if (creadorRol) {
            const lowerRol = creadorRol.toLowerCase();
            if (lowerRol === 'impresion' || lowerRol === 'impresión') {
                where.usuario = {
                    rol: {
                        in: ['Impresión', 'impresion', 'IMPRESIÓN', 'IMPRESION'],
                    }
                };
            }
            else {
                where.usuario = {
                    rol: {
                        equals: creadorRol,
                        mode: 'insensitive'
                    }
                };
            }
        }
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
        const orderBy = estado === 'recibida'
            ? [{ fechaRecepcion: 'desc' }, { fechaCreacion: 'desc' }]
            : pendienteRecepcion
                ? [{ fechaAprobacion: 'desc' }, { fechaCreacion: 'desc' }]
                : { fechaCreacion: 'desc' };
        const [rows, total] = await Promise.all([
            this.prisma.ordenCompra.findMany({
                where,
                include: this.ordenInclude,
                orderBy,
                skip,
                take: limit,
            }),
            this.prisma.ordenCompra.count({ where }),
        ]);
        const items = await this.attachDetallesToOrdenes(rows);
        return {
            items: items,
            total,
        };
    }
    async loadDetallesForOrdenIds(ordenIds) {
        if (!ordenIds.length)
            return new Map();
        const detalles = await this.prisma.detalleCompra.findMany({
            where: { ordenCompraId: { in: ordenIds } },
            include: {
                material: { select: { id: true, nombre: true, codigo: true, categoria: true, subtipo: true, descargaStock: true } },
            },
            orderBy: { id: 'asc' },
        });
        const byOrden = new Map();
        for (const detalle of detalles) {
            const ordenId = detalle.ordenCompraId;
            const list = byOrden.get(ordenId) || [];
            list.push(detalle);
            byOrden.set(ordenId, list);
        }
        return byOrden;
    }
    async attachDetallesToOrdenes(rows) {
        const byOrden = await this.loadDetallesForOrdenIds(rows.map((r) => r.id));
        return rows.map((row) => ({
            ...row,
            detalles: byOrden.get(row.id) || [],
        }));
    }
    async findOrdenById(id) {
        const row = await this.prisma.ordenCompra.findUnique({
            where: { id },
            include: this.ordenInclude,
        });
        if (!row)
            return null;
        const byOrden = await this.loadDetallesForOrdenIds([id]);
        const detalles = byOrden.get(id) || [];
        return {
            ...row,
            detalles,
        };
    }
    async findDetallesByOrdenId(ordenId) {
        const byOrden = await this.loadDetallesForOrdenIds([ordenId]);
        return byOrden.get(ordenId) || [];
    }
    async restoreDetallesIfEmpty(ordenId, detalles) {
        const existing = await this.prisma.detalleCompra.count({
            where: { ordenCompraId: ordenId },
        });
        if (existing > 0) {
            const orden = await this.findOrdenById(ordenId);
            if (!orden)
                throw new Error('Orden de compra no encontrada.');
            return orden;
        }
        if (!detalles?.length) {
            throw new Error('No hay detalles para restaurar.');
        }
        const detallesRows = detalles.map((d) => {
            const precioUnitario = d.precioUnitario ?? 0;
            const cantidad = d.cantidad;
            return {
                ordenCompraId: ordenId,
                descripcion: d.descripcion,
                cantidad,
                precioUnitario,
                subtotal: cantidad * precioUnitario,
                materialId: d.materialId || null,
            };
        });
        await this.prisma.detalleCompra.createMany({ data: detallesRows });
        const subtotal = detallesRows.reduce((sum, d) => sum + d.subtotal, 0);
        const ordenActual = await this.prisma.ordenCompra.findUnique({
            where: { id: ordenId },
            select: { impuesto: true },
        });
        const impuesto = ordenActual?.impuesto ?? 0;
        await this.prisma.ordenCompra.update({
            where: { id: ordenId },
            data: {
                subtotal,
                total: subtotal + impuesto,
            },
        });
        const restored = await this.findOrdenById(ordenId);
        if (!restored)
            throw new Error('Orden de compra no encontrada.');
        return restored;
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
                    createdBy: usuario?.nombre || 'Usuario desconocido',
                },
            });
            // Push solo a administradores
            const adminUsers = await this.prisma.user.findMany({
                where: {
                    rol: { in: ['admin', 'administrador', 'Admin', 'Administrador'] },
                },
                include: {
                    pushSubscriptions: true,
                },
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
        const ordenAnterior = await this.prisma.ordenCompra.findUnique({
            where: { id },
            select: { estado: true, usuarioId: true },
        });
        const updateData = {};
        // Solo actualizar proveedor si se proporciona
        if (data.proveedorId !== undefined) {
            if (data.proveedorId && data.proveedorId.trim() !== '') {
                updateData.proveedor = { connect: { id: data.proveedorId } };
            }
            else {
                updateData.proveedor = { disconnect: true };
            }
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
        if (data.fechaRecepcion)
            updateData.fechaRecepcion = new Date(data.fechaRecepcion);
        if (data.notasRecepcion !== undefined)
            updateData.notasRecepcion = data.notasRecepcion;
        if (data.recibidoPorId)
            updateData.recibidoPorId = data.recibidoPorId;
        if (data.proyectoId !== undefined) {
            if (data.proyectoId) {
                updateData.proyecto = { connect: { id: data.proyectoId } };
            }
            else {
                updateData.proyecto = { disconnect: true };
            }
        }
        // Recalcular o determinar el total actual
        let total = 0;
        let detailsChanged = false;
        if (data.detalles) {
            if (data.detalles.length === 0) {
                throw new Error('La orden debe conservar al menos un item.');
            }
            detailsChanged = true;
            // Recalculate totals
            const detallesData = data.detalles.map(d => ({
                descripcion: d.descripcion,
                cantidad: d.cantidad,
                precioUnitario: d.precioUnitario ?? 0,
                subtotal: d.cantidad * (d.precioUnitario ?? 0),
                materialId: d.materialId || undefined,
            }));
            const subtotal = detallesData.reduce((sum, d) => sum + d.subtotal, 0);
            const ordenActual = await this.prisma.ordenCompra.findUnique({
                where: { id },
                select: { impuesto: true },
            });
            const impuesto = data.impuesto !== undefined
                ? data.impuesto
                : Number(ordenActual?.impuesto ?? 0);
            total = subtotal + impuesto;
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
        }
        else if (data.impuesto !== undefined) {
            const existing = await this.prisma.ordenCompra.findUnique({
                where: { id },
                select: { subtotal: true },
            });
            if (existing) {
                updateData.impuesto = data.impuesto;
                total = existing.subtotal + data.impuesto;
                updateData.total = total;
                detailsChanged = true;
            }
        }
        else {
            const existing = await this.prisma.ordenCompra.findUnique({
                where: { id },
                select: { total: true },
            });
            if (existing) {
                total = existing.total;
            }
        }
        // Cuentas por Pagar (CxP) y Abonos (AbonoCompra)
        const cxp = await this.prisma.cuentaPorPagar.findUnique({
            where: { ordenCompraId: id },
        });
        const esNuevaAprobacion = data.estado === 'aprobada' && ordenAnterior?.estado !== 'aprobada';
        const abonoMonto = (data.registrarAbonoAjuste === true || esNuevaAprobacion)
            ? (Number(data.abonoMonto) || 0)
            : 0;
        if (abonoMonto > 0 && data.metodoPagoId) {
            // Registrar el abono
            await this.prisma.abonoCompra.create({
                data: {
                    ordenCompraId: id,
                    metodoPagoId: data.metodoPagoId,
                    monto: abonoMonto,
                    referencia: data.abonoReferencia || null,
                    registradoPorUserId: data.registradoPorUserId ?? undefined,
                }
            });
            const currentMontoPagado = cxp ? cxp.montoPagado : 0;
            const newMontoPagado = currentMontoPagado + abonoMonto;
            const newSaldo = total - newMontoPagado;
            const newEstado = newSaldo <= 0 ? 'pagado' : 'parcial';
            updateData.estadoPago = newEstado;
            if (cxp) {
                await this.prisma.cuentaPorPagar.update({
                    where: { id: cxp.id },
                    data: {
                        montoTotal: total,
                        montoPagado: newMontoPagado,
                        saldo: Math.max(0, newSaldo),
                        estado: newEstado,
                    },
                });
            }
            else {
                updateData.cuentaPorPagar = {
                    create: {
                        montoTotal: total,
                        montoPagado: abonoMonto,
                        saldo: Math.max(0, total - abonoMonto),
                        estado: abonoMonto >= total ? 'pagado' : 'parcial',
                    },
                };
            }
        }
        else {
            // Sin abono nuevo, pero si cambiaron los detalles o el impuesto, actualizar el montoTotal y saldo
            if (detailsChanged && total > 0) {
                if (cxp) {
                    const newSaldo = total - cxp.montoPagado;
                    const newEstado = newSaldo <= 0 ? 'pagado' : cxp.montoPagado > 0 ? 'parcial' : 'pendiente';
                    updateData.estadoPago = newEstado === 'pendiente' ? 'sin_pagar' : newEstado;
                    await this.prisma.cuentaPorPagar.update({
                        where: { id: cxp.id },
                        data: {
                            montoTotal: total,
                            saldo: Math.max(0, newSaldo),
                            estado: newEstado,
                        },
                    });
                }
                else {
                    updateData.cuentaPorPagar = {
                        create: {
                            montoTotal: total,
                            montoPagado: 0,
                            saldo: total,
                            estado: 'pendiente',
                        },
                    };
                    updateData.estadoPago = 'sin_pagar';
                }
            }
        }
        const row = await this.prisma.ordenCompra.update({
            where: { id },
            data: updateData,
            include: this.ordenInclude,
        });
        const byOrden = await this.loadDetallesForOrdenIds([id]);
        const detallesActualizados = byOrden.get(id) || row.detalles || [];
        const ordenActualizada = {
            ...row,
            detalles: detallesActualizados,
        };
        // Registrar gasto automáticamente si fue aprobada y está ligada a un proyecto (Deshabilitado en Costeo por Consumo)
        /*
        if (data.estado === 'aprobada' && row.proyectoId) {
          try {
            const provName = (row as any).proveedor?.nombre || 'Sin proveedor específico';
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
          } catch (err) {
            console.error('[Gasto Automático Error] No se pudo crear el gasto para el proyecto:', err);
          }
        }
        */
        // Notificar al creador solo en la transición a aprobada (con o sin proyecto)
        const pasoAAprobada = data.estado === 'aprobada' && ordenAnterior?.estado !== 'aprobada';
        if (pasoAAprobada) {
            try {
                const aprobador = data.aprobadoPorId
                    ? await this.prisma.user.findUnique({
                        where: { id: data.aprobadoPorId },
                        select: { nombre: true },
                    })
                    : ordenActualizada.aprobadoPor;
                const aprobadorNombre = aprobador?.nombre || 'Administración';
                // Obtener el creador para conocer su rol
                const creador = await this.prisma.user.findUnique({
                    where: { id: row.usuarioId },
                    select: { id: true, nombre: true, rol: true },
                });
                const creadorRol = creador?.rol || '';
                const creadorRolLower = creadorRol.toLowerCase();
                // 1. Notificación directa al usuario creador
                const notif = await this.prisma.notification.create({
                    data: {
                        title: 'Orden de Compra Aprobada',
                        message: `La orden de compra ${row.numero} ha sido aprobada por ${aprobadorNombre}.`,
                        userId: row.usuarioId,
                        createdBy: aprobadorNombre,
                    },
                });
                // 2. Notificación al ROL del creador (para que su departamento se entere)
                if (creadorRol && creadorRolLower !== 'admin' && creadorRolLower !== 'administrador') {
                    await this.prisma.notification.create({
                        data: {
                            title: 'Orden de Compra Aprobada',
                            message: `La orden de compra ${row.numero} (solicitada por ${creador?.nombre || 'usuario'}) ha sido aprobada por ${aprobadorNombre}.`,
                            userId: null,
                            rol: creadorRol,
                            createdBy: aprobadorNombre,
                        },
                    });
                }
                console.log(`[Notification] Aprobación OC ${row.numero} → usuario ${row.usuarioId} y rol ${creadorRol}`);
                // 3. Web Push Notifications
                const rolesForPush = [];
                if (creadorRol)
                    rolesForPush.push(creadorRol);
                if (creadorRolLower === 'impresión' || creadorRolLower === 'impresion') {
                    rolesForPush.push('impresión', 'impresion', 'IMPRESIÓN', 'IMPRESION');
                }
                else if (creadorRolLower === 'taller') {
                    rolesForPush.push('taller', 'Taller', 'TALLER');
                }
                else if (creadorRolLower === 'ventas' || creadorRolLower === 'diseñador' || creadorRolLower === 'disenador') {
                    rolesForPush.push('ventas', 'Ventas', 'diseñador', 'Diseñador', 'DISEÑADOR');
                }
                const usersToNotify = await this.prisma.user.findMany({
                    where: {
                        OR: [
                            { id: row.usuarioId },
                            rolesForPush.length > 0 ? { rol: { in: rolesForPush } } : { id: 'no-match' },
                        ],
                    },
                    include: { pushSubscriptions: true },
                });
                const pushPayload = JSON.stringify({
                    title: notif.title,
                    body: notif.message,
                    url: '/compras/recepcion',
                });
                for (const user of usersToNotify) {
                    for (const sub of user.pushSubscriptions) {
                        try {
                            const subscriptionParams = {
                                endpoint: sub.endpoint,
                                keys: {
                                    p256dh: sub.p256dh,
                                    auth: sub.auth,
                                },
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
        return ordenActualizada;
    }
    async updateDetalleRecepcion(id, data) {
        await this.prisma.detalleCompra.update({
            where: { id },
            data: {
                cantidadRecibida: data.cantidadRecibida,
                descargableInventario: data.descargableInventario,
                ...(data.fechaRecepcion ? { fechaRecepcion: data.fechaRecepcion } : {}),
            },
        });
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
                ordenCompraId: data.ordenCompraId,
                metodoPagoId: data.metodoPagoId,
                monto: data.monto,
                referencia: data.referencia,
                registradoPorUserId: data.registradoPorUserId ?? undefined,
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
    async findAllMetodosPago(desde, hasta) {
        const metodos = await this.prisma.metodoPago.findMany({
            orderBy: { nombre: 'asc' },
        });
        // 1. Fetch aggregates for all-time transactions grouped by metodoPagoId
        const abonosProformaAllTime = await this.prisma.abonoProforma.groupBy({
            by: ['metodoPagoId'],
            _sum: { monto: true }
        });
        const gastosAllTime = await this.prisma.gasto.groupBy({
            by: ['metodoPagoId'],
            _sum: { monto: true }
        });
        const abonosCompraAllTime = await this.prisma.abonoCompra.groupBy({
            by: ['metodoPagoId'],
            _sum: { monto: true }
        });
        const ingresosAllTime = await this.prisma.ingreso.groupBy({
            by: ['metodoPagoId'],
            _sum: { monto: true }
        });
        const transEnviadasAllTime = await this.prisma.transferencia.groupBy({
            by: ['origenMetodoId'],
            _sum: { monto: true }
        });
        const transRecibidasAllTime = await this.prisma.transferencia.groupBy({
            by: ['destinoMetodoId'],
            _sum: { monto: true }
        });
        // 2. Fetch period-specific aggregates if dates are provided
        let abonosProformaPeriod = [];
        let gastosPeriod = [];
        let abonosCompraPeriod = [];
        let ingresosPeriod = [];
        let transEnviadasPeriod = [];
        let transRecibidasPeriod = [];
        if (desde && hasta) {
            abonosProformaPeriod = await this.prisma.abonoProforma.groupBy({
                by: ['metodoPagoId'],
                _sum: { monto: true },
                where: { fecha: { gte: desde, lte: hasta } }
            });
            gastosPeriod = await this.prisma.gasto.groupBy({
                by: ['metodoPagoId'],
                _sum: { monto: true },
                where: { fecha: { gte: desde, lte: hasta } }
            });
            abonosCompraPeriod = await this.prisma.abonoCompra.groupBy({
                by: ['metodoPagoId'],
                _sum: { monto: true },
                where: { fecha: { gte: desde, lte: hasta } }
            });
            ingresosPeriod = await this.prisma.ingreso.groupBy({
                by: ['metodoPagoId'],
                _sum: { monto: true },
                where: { fecha: { gte: desde, lte: hasta } }
            });
            transEnviadasPeriod = await this.prisma.transferencia.groupBy({
                by: ['origenMetodoId'],
                _sum: { monto: true },
                where: { fecha: { gte: desde, lte: hasta } }
            });
            transRecibidasPeriod = await this.prisma.transferencia.groupBy({
                by: ['destinoMetodoId'],
                _sum: { monto: true },
                where: { fecha: { gte: desde, lte: hasta } }
            });
        }
        const mapById = (arr, key = 'metodoPagoId') => {
            const map = {};
            for (const item of arr) {
                const id = item[key];
                if (id) {
                    map[id] = Number(item._sum.monto || 0);
                }
            }
            return map;
        };
        const ingAllTimeMap = mapById(abonosProformaAllTime);
        const ingManualAllTimeMap = mapById(ingresosAllTime);
        const transEnviadasAllTimeMap = mapById(transEnviadasAllTime, 'origenMetodoId');
        const transRecibidasAllTimeMap = mapById(transRecibidasAllTime, 'destinoMetodoId');
        const gasAllTimeMap = mapById(gastosAllTime);
        const egrAllTimeMap = mapById(abonosCompraAllTime);
        const ingPeriodMap = (desde && hasta) ? mapById(abonosProformaPeriod) : ingAllTimeMap;
        const ingManualPeriodMap = (desde && hasta) ? mapById(ingresosPeriod) : ingManualAllTimeMap;
        const transEnviadasPeriodMap = (desde && hasta) ? mapById(transEnviadasPeriod, 'origenMetodoId') : transEnviadasAllTimeMap;
        const transRecibidasPeriodMap = (desde && hasta) ? mapById(transRecibidasPeriod, 'destinoMetodoId') : transRecibidasAllTimeMap;
        const gasPeriodMap = (desde && hasta) ? mapById(gastosPeriod) : gasAllTimeMap;
        const egrPeriodMap = (desde && hasta) ? mapById(abonosCompraPeriod) : egrAllTimeMap;
        return metodos.map(m => {
            const ingAllTime = (ingAllTimeMap[m.id] || 0) + (ingManualAllTimeMap[m.id] || 0) + (transRecibidasAllTimeMap[m.id] || 0);
            const gasAllTime = gasAllTimeMap[m.id] || 0;
            const egrAllTime = egrAllTimeMap[m.id] || 0;
            const transEnviadasAllTime = transEnviadasAllTimeMap[m.id] || 0;
            const saldoActual = ingAllTime - (gasAllTime + egrAllTime + transEnviadasAllTime);
            const ingPeriod = (ingPeriodMap[m.id] || 0) + (ingManualPeriodMap[m.id] || 0) + (transRecibidasPeriodMap[m.id] || 0);
            const gasPeriod = gasPeriodMap[m.id] || 0;
            const egrPeriod = egrPeriodMap[m.id] || 0;
            const transEnviadasPeriod = transEnviadasPeriodMap[m.id] || 0;
            const egresosPeriod = gasPeriod + egrPeriod + transEnviadasPeriod;
            return {
                id: m.id,
                nombre: m.nombre,
                descripcion: m.descripcion,
                activo: m.activo,
                tipo: m.tipo,
                saldoActual,
                ingresosPeriod: ingPeriod,
                egresosPeriod: egresosPeriod,
                netoPeriod: ingPeriod - egresosPeriod,
            };
        });
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
    // ── Edición con Reconciliación Financiera ──────────────────────────────────
    /**
     * Anula la orden anterior (elimina todos sus registros financieros, devolviendo
     * el dinero a las cuentas de origen) y crea una nueva orden con los datos actualizados.
     * Opcionalmente registra un pago inicial en la nueva orden.
     *
     * Este enfoque es "void & replace":
     * - Los abonos anteriores se eliminan → los saldos de metodos_pago quedan correctos
     *   (los saldos son calculados con SUM en tiempo real, no se guardan).
     * - La CxP anterior se elimina en cascada.
     * - Se crea una nueva orden con nuevo número correlativo.
     * - Si se provee metodoPagoId + abonoMonto, se registra abono en la nueva orden.
     */
    async editarOrdenConReconciliacion(id, data) {
        // 1. Cargar la orden vieja fuera de la transacción (para obtener datos que necesitamos)
        const ordenVieja = await this.prisma.ordenCompra.findUnique({
            where: { id },
            include: {
                detalles: true,
                cuentaPorPagar: true,
                abonos: true,
            },
        });
        if (!ordenVieja)
            throw new Error('Orden de compra no encontrada.');
        const estadosEditables = ['pendiente_aprobacion', 'aprobada', 'parcialmente_recibida'];
        if (!estadosEditables.includes(ordenVieja.estado)) {
            throw new Error(`No se puede editar una orden en estado "${ordenVieja.estado}". Solo se pueden editar órdenes pendientes, aprobadas o con recepción parcial.`);
        }
        // Validar que no se eliminen ítems ya recepcionados en inventario
        const detallesExistentes = ordenVieja.detalles;
        for (const nuevoDetalle of data.detalles) {
            if (!nuevoDetalle.id)
                continue;
            const existente = detallesExistentes.find((d) => d.id === nuevoDetalle.id);
            if (!existente)
                continue;
            const fueRecepcionado = (existente.cantidadRecibida ?? 0) > 0;
            const esInventario = !!existente.materialId;
            if (fueRecepcionado && esInventario && nuevoDetalle.cantidad !== existente.cantidad) {
                throw new Error(`El ítem "${existente.descripcion}" ya fue recepcionado en inventario. No se puede cambiar la cantidad (${existente.cantidad}). Solo se puede editar el precio.`);
            }
        }
        for (const existente of detallesExistentes) {
            const fueRecepcionado = (existente.cantidadRecibida ?? 0) > 0;
            const esInventario = !!existente.materialId;
            if (fueRecepcionado && esInventario) {
                const sigueEnLista = data.detalles.some((d) => d.id === existente.id);
                if (!sigueEnLista) {
                    throw new Error(`El ítem "${existente.descripcion}" ya fue recepcionado y no puede eliminarse de la orden.`);
                }
            }
        }
        // 2. Calcular totales de la nueva orden
        const nuevosDetallesData = data.detalles.map((d) => {
            const existente = d.id ? detallesExistentes.find((e) => e.id === d.id) : null;
            return {
                descripcion: d.descripcion,
                cantidad: d.cantidad,
                precioUnitario: d.precioUnitario,
                subtotal: d.cantidad * d.precioUnitario,
                materialId: d.materialId || null,
                cantidadRecibida: existente?.cantidadRecibida ?? null,
                descargableInventario: existente?.descargableInventario ?? null,
                fechaRecepcion: existente?.fechaRecepcion ?? null,
            };
        });
        const nuevoSubtotal = nuevosDetallesData.reduce((sum, d) => sum + d.subtotal, 0);
        const nuevoImpuesto = data.impuesto ?? 0;
        const nuevoTotal = nuevoSubtotal + nuevoImpuesto;
        // 3. Determinar estado de recepción de la nueva orden
        // Si algún ítem fue recepcionado, la nueva orden hereda ese estado
        const algunoRecibido = detallesExistentes.some((d) => (d.cantidadRecibida ?? 0) > 0);
        const todosRecibidos = detallesExistentes.length > 0 &&
            detallesExistentes.every((d) => (d.cantidadRecibida ?? 0) > 0);
        const estadoNuevo = todosRecibidos ? 'recibida'
            : algunoRecibido ? 'parcialmente_recibida'
                : ordenVieja.estado === 'aprobada' ? 'aprobada'
                    : 'pendiente_aprobacion';
        // 4. Transacción: eliminar la orden vieja y crear la nueva
        const nuevaOrden = await this.prisma.$transaction(async (tx) => {
            // Eliminar abonos (esto restaura los saldos en los métodos de pago automáticamente,
            // porque los saldos se calculan con SUM en tiempo real)
            await tx.abonoCompra.deleteMany({ where: { ordenCompraId: id } });
            // Eliminar CxP
            await tx.cuentaPorPagar.deleteMany({ where: { ordenCompraId: id } });
            // Eliminar detalles
            await tx.detalleCompra.deleteMany({ where: { ordenCompraId: id } });
            // Eliminar la orden vieja
            await tx.ordenCompra.delete({ where: { id } });
            // Generar nuevo número correlativo
            const year = new Date().getFullYear();
            const suffix = `_${year}`;
            const last = await tx.ordenCompra.findFirst({
                where: { numero: { endsWith: suffix } },
                orderBy: { numero: 'desc' },
                select: { numero: true },
            });
            const lastNum = last ? parseInt(last.numero.split('_')[1], 10) : 0;
            const nuevoNumero = `ORC_${String(lastNum + 1).padStart(3, '0')}_${year}`;
            // Preparar abono inicial si se provee
            const abonoMonto = data.abonoMonto && data.abonoMonto > 0 ? data.abonoMonto : 0;
            const montoPagadoInicial = abonoMonto;
            const saldoInicial = Math.max(0, nuevoTotal - montoPagadoInicial);
            let estadoPago;
            if (nuevoTotal <= 0) {
                estadoPago = 'sin_pagar';
            }
            else if (saldoInicial <= 0) {
                estadoPago = 'pagado';
            }
            else if (montoPagadoInicial > 0) {
                estadoPago = 'parcial';
            }
            else {
                estadoPago = 'sin_pagar';
            }
            // Crear la nueva orden
            const createData = {
                numero: nuevoNumero,
                usuarioId: ordenVieja.usuarioId,
                fecha: data.fecha ? new Date(data.fecha) : new Date(ordenVieja.fecha),
                subtotal: nuevoSubtotal,
                impuesto: nuevoImpuesto,
                total: nuevoTotal,
                concepto: data.concepto ?? ordenVieja.concepto ?? '',
                notas: data.notas ?? ordenVieja.notas ?? '',
                estado: estadoNuevo,
                estadoPago,
                aprobadoPorId: ordenVieja.aprobadoPorId ?? null,
                fechaAprobacion: ordenVieja.fechaAprobacion ?? null,
                recibidoPorId: ordenVieja.recibidoPorId ?? null,
                fechaRecepcion: ordenVieja.fechaRecepcion ?? null,
                notasRecepcion: ordenVieja.notasRecepcion ?? null,
                proveedorId: ordenVieja.proveedorId ?? null,
                proyectoId: data.proyectoId !== undefined ? (data.proyectoId || null) : (ordenVieja.proyectoId || null),
                detalles: {
                    create: nuevosDetallesData.map((d) => ({
                        descripcion: d.descripcion,
                        cantidad: d.cantidad,
                        precioUnitario: d.precioUnitario,
                        subtotal: d.subtotal,
                        materialId: d.materialId,
                        cantidadRecibida: d.cantidadRecibida,
                        descargableInventario: d.descargableInventario,
                        fechaRecepcion: d.fechaRecepcion,
                    })),
                },
            };
            // Crear CxP si hay total
            if (nuevoTotal > 0) {
                createData.cuentaPorPagar = {
                    create: {
                        montoTotal: nuevoTotal,
                        montoPagado: montoPagadoInicial,
                        saldo: saldoInicial,
                        estado: estadoPago === 'sin_pagar' ? 'pendiente'
                            : estadoPago === 'pagado' ? 'pagado' : 'parcial',
                    },
                };
            }
            // Crear abono inicial si hay pago
            if (abonoMonto > 0 && data.metodoPagoId) {
                createData.abonos = {
                    create: {
                        metodoPagoId: data.metodoPagoId,
                        monto: abonoMonto,
                        referencia: data.abonoReferencia || null,
                        registradoPorUserId: data.editadoPorId,
                    },
                };
            }
            const nueva = await tx.ordenCompra.create({
                data: createData,
                select: { id: true },
            });
            return nueva.id;
        });
        // 5. Retornar la nueva orden con include completo
        const resultado = await this.findOrdenById(nuevaOrden);
        if (!resultado)
            throw new Error('No se pudo recuperar la nueva orden.');
        return resultado;
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
