export class ComprasController {
    service;
    constructor(service) {
        this.service = service;
    }
    ok(res, data) {
        return res.json({ success: true, data });
    }
    fail(res, err, status = 500) {
        const message = err instanceof Error ? err.message : 'Error interno del servidor.';
        return res.status(status).json({ success: false, error: { message } });
    }
    str(val) {
        return typeof val === 'string' ? val : undefined;
    }
    // ── Proveedores ────────────────────────────────────────────────────────────
    async listProveedores(_req, res) {
        try {
            const data = await this.service.getProveedores();
            return this.ok(res, data);
        }
        catch (e) {
            return this.fail(res, e);
        }
    }
    async createProveedor(req, res) {
        try {
            const data = await this.service.createProveedor(req.body);
            return res.status(201).json({ success: true, data });
        }
        catch (e) {
            return this.fail(res, e, 400);
        }
    }
    async updateProveedor(req, res) {
        try {
            const data = await this.service.updateProveedor(String(req.params.id), req.body);
            return this.ok(res, data);
        }
        catch (e) {
            return this.fail(res, e, 400);
        }
    }
    async deleteProveedor(req, res) {
        try {
            await this.service.deleteProveedor(String(req.params.id));
            return this.ok(res, { deleted: true });
        }
        catch (e) {
            return this.fail(res, e);
        }
    }
    // ── Órdenes de Compra ──────────────────────────────────────────────────────
    async listOrdenes(req, res) {
        try {
            const page = req.query.page ? parseInt(String(req.query.page), 10) : undefined;
            const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
            const search = this.str(req.query.search);
            const estado = this.str(req.query.estado);
            const estadoPago = this.str(req.query.estadoPago);
            const creadorRol = this.str(req.query.creadorRol);
            const data = await this.service.getOrdenes({ page, limit, search, estado, estadoPago, creadorRol });
            return this.ok(res, data);
        }
        catch (e) {
            return this.fail(res, e);
        }
    }
    async getOrdenById(req, res) {
        try {
            const data = await this.service.getOrdenById(String(req.params.id));
            if (!data)
                return res.status(404).json({ success: false, error: { message: 'Orden no encontrada.' } });
            return this.ok(res, data);
        }
        catch (e) {
            return this.fail(res, e);
        }
    }
    async createOrden(req, res) {
        try {
            const userId = req.user?.id;
            if (!userId) {
                throw new Error('Usuario no autenticado o sesión inválida.');
            }
            const data = await this.service.createOrden({
                ...req.body,
                usuarioId: userId,
            });
            return res.status(201).json({ success: true, data });
        }
        catch (e) {
            return this.fail(res, e, 400);
        }
    }
    async updateOrden(req, res) {
        try {
            const userId = req.user?.id;
            const updateData = { ...req.body };
            // Si se está aprobando la orden, agregar el usuario que aprueba
            if (updateData.estado === 'aprobada' && userId) {
                updateData.aprobadoPorId = userId;
            }
            const data = await this.service.updateOrden(String(req.params.id), updateData);
            return this.ok(res, data);
        }
        catch (e) {
            return this.fail(res, e, 400);
        }
    }
    async deleteOrden(req, res) {
        try {
            await this.service.deleteOrden(String(req.params.id));
            return this.ok(res, { deleted: true });
        }
        catch (e) {
            return this.fail(res, e);
        }
    }
    // ── Abonos ─────────────────────────────────────────────────────────────────
    async listAbonos(req, res) {
        try {
            const data = await this.service.getAbonosByOrden(String(req.params.id));
            return this.ok(res, data);
        }
        catch (e) {
            return this.fail(res, e);
        }
    }
    async createAbono(req, res) {
        try {
            const data = await this.service.registrarAbono({
                ...req.body,
                ordenCompraId: String(req.params.id),
            });
            return res.status(201).json({ success: true, data });
        }
        catch (e) {
            return this.fail(res, e, 400);
        }
    }
    // ── Cuentas por Pagar ──────────────────────────────────────────────────────
    async listCuentasPorPagar(req, res) {
        try {
            const page = req.query.page ? parseInt(String(req.query.page), 10) : undefined;
            const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
            const estado = this.str(req.query.estado);
            const data = await this.service.getCuentasPorPagar({ page, limit, estado });
            return this.ok(res, data);
        }
        catch (e) {
            return this.fail(res, e);
        }
    }
    // ── Métodos de Pago ────────────────────────────────────────────────────────
    async listMetodosPago(req, res) {
        try {
            const { desde, hasta } = req.query;
            let desdeDate;
            let hastaLimit;
            if (desde && hasta) {
                const desdeStr = String(desde);
                desdeDate = desdeStr.includes('T') ? new Date(desdeStr) : new Date(desdeStr + 'T00:00:00');
                const hastaStr = String(hasta);
                hastaLimit = hastaStr.includes('T') ? new Date(hastaStr) : new Date(hastaStr + 'T23:59:59.999');
            }
            const data = await this.service.getMetodosPago(desdeDate, hastaLimit);
            return this.ok(res, data);
        }
        catch (e) {
            return this.fail(res, e);
        }
    }
    async createMetodoPago(req, res) {
        try {
            const { nombre, descripcion, tipo } = req.body || {};
            const data = await this.service.createMetodoPago({ nombre, descripcion, tipo });
            return res.status(201).json({ success: true, data });
        }
        catch (e) {
            return this.fail(res, e, 400);
        }
    }
    async updateMetodoPago(req, res) {
        try {
            const { nombre, descripcion, activo, tipo } = req.body || {};
            const data = await this.service.updateMetodoPago(String(req.params.id), { nombre, descripcion, activo, tipo });
            return this.ok(res, data);
        }
        catch (e) {
            return this.fail(res, e, 400);
        }
    }
    async deleteMetodoPago(req, res) {
        try {
            await this.service.deleteMetodoPago(String(req.params.id));
            return this.ok(res, { deleted: true });
        }
        catch (e) {
            return this.fail(res, e);
        }
    }
    // ── Stats ──────────────────────────────────────────────────────────────────
    async getStats(_req, res) {
        try {
            const data = await this.service.getComprasStats();
            return this.ok(res, data);
        }
        catch (e) {
            return this.fail(res, e);
        }
    }
    async recepcionarOrden(req, res) {
        try {
            const id = String(req.params.id);
            const userId = req.user?.id;
            if (!userId) {
                throw new Error('Usuario no autenticado o sesión inválida.');
            }
            const { detalles } = req.body;
            if (!Array.isArray(detalles)) {
                throw new Error('Los detalles recibidos son requeridos y deben ser un arreglo.');
            }
            const data = await this.service.recepcionarOrden(id, userId, detalles);
            return this.ok(res, data);
        }
        catch (e) {
            return this.fail(res, e, 400);
        }
    }
}
