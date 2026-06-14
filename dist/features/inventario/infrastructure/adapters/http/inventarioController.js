export class InventarioController {
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
    // ── Materiales ──────────────────────────────────────────────────────────────
    async listMateriales(req, res) {
        try {
            const tipo = this.str(req.query.tipo);
            const page = req.query.page ? parseInt(String(req.query.page), 10) : undefined;
            const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
            const search = this.str(req.query.search);
            const categoria = this.str(req.query.categoria);
            const data = await this.service.getInventario({ tipo, page, limit, search, categoria });
            return this.ok(res, data);
        }
        catch (e) {
            return this.fail(res, e);
        }
    }
    async getStats(req, res) {
        try {
            const data = await this.service.getStats();
            return this.ok(res, data);
        }
        catch (e) {
            return this.fail(res, e);
        }
    }
    async listUnidadesMedida(req, res) {
        try {
            const data = await this.service.getUnidadesMedida();
            return this.ok(res, data);
        }
        catch (e) {
            return this.fail(res, e);
        }
    }
    async createMaterial(req, res) {
        try {
            const data = await this.service.createMaterial(req.body);
            return res.status(201).json({ success: true, data });
        }
        catch (e) {
            return this.fail(res, e);
        }
    }
    async updateMaterial(req, res) {
        try {
            const data = await this.service.updateMaterial(String(req.params.id), req.body);
            return this.ok(res, data);
        }
        catch (e) {
            return this.fail(res, e);
        }
    }
    async deleteMaterial(req, res) {
        try {
            await this.service.deleteMaterial(String(req.params.id));
            return this.ok(res, { deleted: true });
        }
        catch (e) {
            return this.fail(res, e);
        }
    }
    // ── Movimientos ──────────────────────────────────────────────────────────────
    async listMovimientos(req, res) {
        try {
            const data = await this.service.getMovimientos(this.str(req.query.materialId));
            return this.ok(res, data);
        }
        catch (e) {
            return this.fail(res, e);
        }
    }
    async createMovimiento(req, res) {
        try {
            const data = await this.service.registrarMovimiento({
                ...req.body,
                materialId: String(req.params.id),
            });
            return res.status(201).json({ success: true, data });
        }
        catch (e) {
            return this.fail(res, e, 400);
        }
    }
    // ── Préstamos ────────────────────────────────────────────────────────────────
    async listPrestamos(req, res) {
        try {
            const data = await this.service.getPrestamos(this.str(req.query.estado));
            return this.ok(res, data);
        }
        catch (e) {
            return this.fail(res, e);
        }
    }
    async createPrestamo(req, res) {
        try {
            const data = await this.service.registrarPrestamo(req.body);
            return res.status(201).json({ success: true, data });
        }
        catch (e) {
            return this.fail(res, e, 400);
        }
    }
    async returnPrestamo(req, res) {
        try {
            const data = await this.service.devolverPrestamo(String(req.params.id));
            return this.ok(res, data);
        }
        catch (e) {
            return this.fail(res, e, 400);
        }
    }
}
