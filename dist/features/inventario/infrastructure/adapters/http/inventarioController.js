import { resolveInventarioCategoria, getInventarioCategoriaPorRol } from '../../utils/inventarioCategoriaPorRol.js';
import { isCategoriaValida } from '../../../application/utils/inventarioImportUtils.js';
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
    userRol(req) {
        return req.user?.rol;
    }
    // ── Materiales ──────────────────────────────────────────────────────────────
    async listMateriales(req, res) {
        try {
            const tipo = this.str(req.query.tipo);
            const page = req.query.page ? parseInt(String(req.query.page), 10) : undefined;
            const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
            const search = this.str(req.query.search);
            const categoria = resolveInventarioCategoria(this.userRol(req), this.str(req.query.categoria));
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
            const body = { ...req.body };
            const categoriaRol = resolveInventarioCategoria(this.userRol(req));
            if (categoriaRol) {
                body.categoria = categoriaRol;
            }
            const data = await this.service.createMaterial(body);
            return res.status(201).json({ success: true, data });
        }
        catch (e) {
            return this.fail(res, e);
        }
    }
    async downloadImportTemplate(req, res) {
        try {
            const categoriaQuery = this.str(req.query.categoria) || 'Taller';
            const categoriaRol = getInventarioCategoriaPorRol(this.userRol(req));
            const categoria = categoriaRol || categoriaQuery;
            if (!isCategoriaValida(categoria)) {
                return this.fail(res, new Error('Categoría inválida. Use: Taller, Oficina o Impresión.'), 400);
            }
            const { buffer, filename } = await this.service.generateImportTemplate(categoria);
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            return res.send(buffer);
        }
        catch (e) {
            return this.fail(res, e, 400);
        }
    }
    async importMateriales(req, res) {
        try {
            const body = req.body;
            const categoriaRol = getInventarioCategoriaPorRol(this.userRol(req));
            const categoria = categoriaRol || body.categoria;
            if (!categoria || !isCategoriaValida(categoria)) {
                return this.fail(res, new Error('Categoría inválida o no especificada.'), 400);
            }
            const items = Array.isArray(body.items) ? body.items : [];
            const result = await this.service.importMateriales(categoria, items);
            return res.status(201).json({ success: true, data: result });
        }
        catch (e) {
            return this.fail(res, e, 400);
        }
    }
    async importMaterialesFromFile(req, res) {
        try {
            const file = req.file;
            if (!file?.buffer) {
                return this.fail(res, new Error('Debe adjuntar un archivo Excel (.xlsx).'), 400);
            }
            const categoriaBody = typeof req.body?.categoria === 'string' ? req.body.categoria : undefined;
            const categoriaRol = getInventarioCategoriaPorRol(this.userRol(req));
            const categoria = categoriaRol || categoriaBody;
            if (!categoria || !isCategoriaValida(categoria)) {
                return this.fail(res, new Error('Categoría inválida o no especificada.'), 400);
            }
            const result = await this.service.parseAndImportFromExcel(file.buffer, categoria);
            return res.status(201).json({ success: true, data: result });
        }
        catch (e) {
            return this.fail(res, e, 400);
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
            const body = req.body;
            const fecha = body.fecha ? new Date(String(body.fecha)) : undefined;
            const data = await this.service.registrarMovimiento({
                ...body,
                materialId: String(req.params.id),
                ...(fecha && !Number.isNaN(fecha.getTime()) ? { fecha } : {}),
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
            const observacion = typeof req.body?.observacionDevolucion === 'string'
                ? req.body.observacionDevolucion.trim()
                : undefined;
            const data = await this.service.devolverPrestamo(String(req.params.id), observacion || undefined);
            return this.ok(res, data);
        }
        catch (e) {
            return this.fail(res, e, 400);
        }
    }
    async getMaterialHistorial(req, res) {
        try {
            const data = await this.service.getMaterialHistorial(String(req.params.id));
            return this.ok(res, data);
        }
        catch (e) {
            return this.fail(res, e);
        }
    }
}
