export class ComprasService {
    repo;
    constructor(repo) {
        this.repo = repo;
    }
    // ── Proveedores ────────────────────────────────────────────────────────────
    getProveedores() {
        return this.repo.findAllProveedores();
    }
    createProveedor(data) {
        if (!data.nombre || !data.nombre.trim()) {
            throw new Error('El nombre del proveedor es requerido.');
        }
        return this.repo.createProveedor(data);
    }
    updateProveedor(id, data) {
        return this.repo.updateProveedor(id, data);
    }
    deleteProveedor(id) {
        return this.repo.deleteProveedor(id);
    }
    // ── Órdenes de Compra ──────────────────────────────────────────────────────
    getOrdenes(options) {
        return this.repo.findAllOrdenes(options);
    }
    getOrdenById(id) {
        return this.repo.findOrdenById(id);
    }
    async createOrden(data) {
        if (!data.detalles || data.detalles.length === 0) {
            throw new Error('La orden debe tener al menos un item de detalle.');
        }
        for (const d of data.detalles) {
            if (d.cantidad <= 0)
                throw new Error('La cantidad debe ser mayor a 0.');
            if (d.precioUnitario < 0)
                throw new Error('El precio unitario no puede ser negativo.');
        }
        return this.repo.createOrden(data);
    }
    async updateOrden(id, data) {
        const orden = await this.repo.findOrdenById(id);
        if (!orden)
            throw new Error('Orden de compra no encontrada.');
        return this.repo.updateOrden(id, data);
    }
    async deleteOrden(id) {
        const orden = await this.repo.findOrdenById(id);
        if (!orden)
            throw new Error('Orden de compra no encontrada.');
        return this.repo.deleteOrden(id);
    }
    // ── Abonos ─────────────────────────────────────────────────────────────────
    getAbonosByOrden(ordenId) {
        return this.repo.findAbonosByOrden(ordenId);
    }
    async registrarAbono(data) {
        if (data.monto <= 0)
            throw new Error('El monto del abono debe ser mayor a 0.');
        const orden = await this.repo.findOrdenById(data.ordenCompraId);
        if (!orden)
            throw new Error('Orden de compra no encontrada.');
        const cxp = orden.cuentaPorPagar;
        if (!cxp)
            throw new Error('No se encontró cuenta por pagar para esta orden.');
        if (cxp.estado === 'pagado') {
            throw new Error('Esta orden ya está completamente pagada.');
        }
        if (data.monto > cxp.saldo) {
            throw new Error(`El abono excede el saldo pendiente. Saldo disponible: $${cxp.saldo.toFixed(2)}`);
        }
        // Create the abono
        const abono = await this.repo.createAbono(data);
        // Update CxP
        const newMontoPagado = cxp.montoPagado + data.monto;
        const newSaldo = cxp.montoTotal - newMontoPagado;
        const newEstado = newSaldo <= 0 ? 'pagado' : 'parcial';
        await this.repo.updateCuentaPorPagar(cxp.id, {
            montoPagado: newMontoPagado,
            saldo: Math.max(0, newSaldo),
            estado: newEstado,
        });
        // Update orden payment status
        await this.repo.updateOrden(data.ordenCompraId, {
            estado: undefined,
        });
        // Update the order's payment status directly
        const ordenUpdate = {};
        ordenUpdate.estadoPago = newEstado === 'pagado' ? 'pagado' : 'parcial';
        // We need a small helper to update just the estadoPago field
        // For now, use updateOrden which handles it
        await this.repo.updateOrden(data.ordenCompraId, ordenUpdate);
        return abono;
    }
    // ── Cuentas por Pagar ──────────────────────────────────────────────────────
    getCuentasPorPagar(options) {
        return this.repo.findAllCuentasPorPagar(options);
    }
    // ── Métodos de Pago ────────────────────────────────────────────────────────
    getMetodosPago(desde, hasta) {
        return this.repo.findAllMetodosPago(desde, hasta);
    }
    async createMetodoPago(data) {
        if (!data.nombre || !data.nombre.trim()) {
            throw new Error('El nombre del método de pago es requerido.');
        }
        return this.repo.createMetodoPago({
            ...data,
            nombre: data.nombre.trim(),
            tipo: data.tipo || 'EFECTIVO'
        });
    }
    async updateMetodoPago(id, data) {
        return this.repo.updateMetodoPago(id, data);
    }
    async deleteMetodoPago(id) {
        return this.repo.deleteMetodoPago(id);
    }
    // ── Stats ──────────────────────────────────────────────────────────────────
    getComprasStats() {
        return this.repo.getComprasStats();
    }
    async recepcionarOrden(id, usuarioId, payload) {
        const orden = await this.repo.findOrdenById(id);
        if (!orden) {
            throw new Error('Orden de compra no encontrada.');
        }
        if (orden.estado !== 'aprobada' && orden.estado !== 'parcialmente_recibida') {
            throw new Error('Solo se pueden recepcionar órdenes aprobadas o con recepción parcial.');
        }
        const ordenDetalles = orden.detalles || [];
        for (const item of payload.detalles) {
            if (item.cantidad <= 0)
                continue;
            const detalle = ordenDetalles.find((d) => d.id === item.detalleId);
            if (!detalle) {
                throw new Error('Ítem de la orden no encontrado.');
            }
            if ((detalle.cantidadRecibida ?? 0) > 0) {
                throw new Error(`El ítem "${detalle.descripcion}" ya fue recepcionado.`);
            }
            const fechaItem = item.fechaRecepcion
                ? new Date(item.fechaRecepcion)
                : payload.fechaRecepcion
                    ? new Date(payload.fechaRecepcion)
                    : new Date();
            const descargable = item.descargableInventario === true;
            if (item.detalleId) {
                await this.repo.updateDetalleRecepcion(item.detalleId, {
                    cantidadRecibida: item.cantidad,
                    descargableInventario: descargable,
                    fechaRecepcion: fechaItem,
                });
            }
            if (descargable && item.materialId) {
                await this.repo.adjustMaterialStock(item.materialId, item.cantidad);
                await this.repo.createMaterialMovimiento({
                    materialId: item.materialId,
                    tipo: 'entrada',
                    cantidad: item.cantidad,
                    motivo: `Recepción OC ${orden.numero}${item.observacion ? ` — ${item.observacion}` : ''}`,
                    userId: usuarioId,
                });
            }
        }
        const updated = await this.repo.findOrdenById(id);
        const detalles = updated?.detalles || [];
        const todosRecibidos = detalles.length > 0 && detalles.every((d) => (d.cantidadRecibida ?? 0) > 0);
        const algunoRecibido = detalles.some((d) => (d.cantidadRecibida ?? 0) > 0);
        const fechas = detalles
            .map((d) => d.fechaRecepcion)
            .filter((f) => !!f)
            .map((f) => new Date(f).getTime());
        const ultimaFecha = fechas.length ? new Date(Math.max(...fechas)) : new Date();
        const nuevoEstado = todosRecibidos
            ? 'recibida'
            : algunoRecibido
                ? 'parcialmente_recibida'
                : orden.estado;
        return this.repo.updateOrden(id, {
            estado: nuevoEstado,
            fechaRecepcion: algunoRecibido ? ultimaFecha : undefined,
            notasRecepcion: payload.notasRecepcion ?? updated?.notasRecepcion ?? undefined,
            recibidoPorId: usuarioId,
        });
    }
}
