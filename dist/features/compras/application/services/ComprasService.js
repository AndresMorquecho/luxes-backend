import { parseDateOnly, formatDateOnly } from '../../../../shared/utils/dateOnly.js';
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
    getOrdenDetalles(ordenId) {
        return this.repo.findDetallesByOrdenId(ordenId);
    }
    restoreOrdenDetalles(ordenId, detalles) {
        if (!detalles?.length) {
            throw new Error('Debe indicar al menos un detalle para restaurar.');
        }
        for (const d of detalles) {
            if (!d.descripcion?.trim())
                throw new Error('Cada detalle debe tener descripción.');
            if (d.cantidad <= 0)
                throw new Error('La cantidad debe ser mayor a 0.');
        }
        return this.repo.restoreDetallesIfEmpty(ordenId, detalles);
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
        if (orden.estado === 'recibida' || orden.estado === 'parcialmente_recibida') {
            throw new Error('No se puede modificar una orden que ya fue recibida o está en recepción parcial.');
        }
        const isApprovalTransition = data.estado === 'aprobada' || data.estado === 'rechazada';
        if (!isApprovalTransition && orden.estado !== 'aprobada') {
            throw new Error('Solo se pueden editar órdenes que ya fueron aprobadas.');
        }
        if (data.detalles && data.detalles.length === 0) {
            throw new Error('La orden debe conservar al menos un item.');
        }
        const esNuevaAprobacion = data.estado === 'aprobada' && orden.estado !== 'aprobada';
        const abonoMonto = (data.registrarAbonoAjuste === true || esNuevaAprobacion)
            ? (Number(data.abonoMonto) || 0)
            : 0;
        if (abonoMonto > 0) {
            if (!data.metodoPagoId) {
                throw new Error('Debe seleccionar un método de pago para registrar el abono del ajuste.');
            }
            let nuevoTotal = Number(orden.total) || 0;
            if (data.detalles?.length) {
                const subtotal = data.detalles.reduce((sum, d) => sum + d.cantidad * (d.precioUnitario ?? 0), 0);
                const impuesto = data.impuesto !== undefined ? data.impuesto : (Number(orden.impuesto) || 0);
                nuevoTotal = subtotal + impuesto;
            }
            const pagado = Number(orden.cuentaPorPagar?.montoPagado) || 0;
            const saldoTrasAjuste = Math.max(0, nuevoTotal - pagado);
            if (abonoMonto > saldoTrasAjuste + 0.01) {
                throw new Error(`El abono excede el saldo pendiente tras el ajuste ($${saldoTrasAjuste.toFixed(2)}).`);
            }
        }
        return this.repo.updateOrden(id, data);
    }
    async deleteOrden(id) {
        const orden = await this.repo.findOrdenById(id);
        if (!orden)
            throw new Error('Orden de compra no encontrada.');
        return this.repo.deleteOrden(id);
    }
    async editarOrden(id, data) {
        if (!data.detalles || data.detalles.length === 0) {
            throw new Error('La orden debe conservar al menos un ítem.');
        }
        for (const d of data.detalles) {
            if (d.cantidad <= 0)
                throw new Error(`La cantidad de "${d.descripcion}" debe ser mayor a 0.`);
            if (d.precioUnitario < 0)
                throw new Error(`El precio de "${d.descripcion}" no puede ser negativo.`);
        }
        if (data.abonoMonto && data.abonoMonto > 0 && !data.metodoPagoId) {
            throw new Error('Debe seleccionar un método de pago para registrar el pago inicial.');
        }
        return this.repo.editarOrdenConReconciliacion(id, {
            ...data,
            impuesto: data.impuesto ?? 0,
        });
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
    async eliminarAbono(ordenCompraId, abonoId) {
        const orden = await this.repo.findOrdenById(ordenCompraId);
        if (!orden)
            throw new Error('Orden de compra no encontrada.');
        const abonos = await this.repo.findAbonosByOrden(ordenCompraId);
        if (!abonos || abonos.length === 0) {
            throw new Error('No existen abonos registrados para esta orden de compra.');
        }
        const abonosSorted = abonos.slice().sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
        const lastAbono = abonosSorted[abonosSorted.length - 1];
        if (lastAbono.id !== String(abonoId)) {
            throw new Error('Solo se puede eliminar el último abono registrado.');
        }
        await this.repo.deleteAbono(abonoId, ordenCompraId, lastAbono.monto);
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
                ? parseDateOnly(item.fechaRecepcion) || new Date()
                : payload.fechaRecepcion
                    ? parseDateOnly(payload.fechaRecepcion) || new Date()
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
                // Crear un nuevo Material individual (rollo) en lugar de sumar al stock base.
                // El material original queda intacto como referencia / plantilla.
                const precioCosto = detalle.precioUnitario ?? 0;
                await this.repo.createMaterialDesdeRollo({
                    materialBaseId: item.materialId,
                    metros: item.cantidad,
                    ordenNumero: orden.numero,
                    userId: usuarioId,
                    precioCosto,
                });
            }
        }
        const updated = await this.repo.findOrdenById(id);
        const detalles = updated?.detalles || [];
        const todosRecibidos = detalles.length > 0 && detalles.every((d) => (d.cantidadRecibida ?? 0) > 0);
        const algunoRecibido = detalles.some((d) => (d.cantidadRecibida ?? 0) > 0);
        const fechasIso = detalles
            .map((d) => formatDateOnly(d.fechaRecepcion))
            .filter((f) => !!f)
            .sort()
            .reverse();
        const ultimaFecha = fechasIso.length ? (parseDateOnly(fechasIso[0]) || new Date()) : new Date();
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
    // ── Cheques Posfechados ─────────────────────────────────────────────────────
    getCheques(options) {
        return this.repo.findAllChequesCompra(options);
    }
    async crearChequePosfechado(input) {
        if (!input.ordenCompraId)
            throw new Error('Se requiere ID de Orden de Compra.');
        if (!input.metodoPagoId)
            throw new Error('Se requiere seleccionar la cuenta/banco de origen.');
        if (!input.numeroCheque?.trim())
            throw new Error('Se requiere ingresar el número de cheque.');
        if (!input.monto || input.monto <= 0)
            throw new Error('El monto del cheque debe ser mayor a 0.');
        if (!input.fechaCobro)
            throw new Error('Se requiere la fecha de cobro/emisión del cheque.');
        const fechaCobroDate = new Date(input.fechaCobro);
        if (isNaN(fechaCobroDate.getTime()))
            throw new Error('La fecha de cobro no es válida.');
        return this.repo.createChequeCompra({
            ordenCompraId: input.ordenCompraId,
            metodoPagoId: input.metodoPagoId,
            numeroCheque: input.numeroCheque.trim(),
            monto: input.monto,
            fechaCobro: fechaCobroDate,
            referencia: input.referencia?.trim() || `Cheque Posfechado N° ${input.numeroCheque.trim()}`,
            registradoPorUserId: input.registradoPorUserId,
        });
    }
    async procesarCheque(id) {
        if (!id)
            throw new Error('ID de cheque inválido.');
        return this.repo.procesarChequeCompra(id);
    }
    async editarChequePosfechado(id, data) {
        if (!id)
            throw new Error('ID de cheque inválido.');
        let fechaCobroDate = undefined;
        if (data.fechaCobro) {
            fechaCobroDate = new Date(data.fechaCobro);
            if (isNaN(fechaCobroDate.getTime()))
                throw new Error('La fecha de cobro no es válida.');
        }
        return this.repo.updateChequeCompra(id, {
            numeroCheque: data.numeroCheque?.trim(),
            fechaCobro: fechaCobroDate,
            monto: data.monto ? Number(data.monto) : undefined,
            metodoPagoId: data.metodoPagoId,
        });
    }
    async eliminarChequePosfechado(id) {
        if (!id)
            throw new Error('ID de cheque inválido.');
        return this.repo.deleteChequeCompra(id);
    }
}
