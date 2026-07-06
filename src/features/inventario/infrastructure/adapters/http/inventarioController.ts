import type { Request, Response } from 'express';
import type { InventarioService } from '../../../application/services/InventarioService.js';
import { resolveInventarioCategoria, getInventarioCategoriaPorRol } from '../../utils/inventarioCategoriaPorRol.js';
import { isCategoriaValida } from '../../../application/utils/inventarioImportUtils.js';

export class InventarioController {
  constructor(private readonly service: InventarioService) {}

  private ok(res: Response, data: unknown) {
    return res.json({ success: true, data });
  }

  private fail(res: Response, err: unknown, status = 500) {
    const message = err instanceof Error ? err.message : 'Error interno del servidor.';
    return res.status(status).json({ success: false, error: { message } });
  }

  private str(val: unknown): string | undefined {
    return typeof val === 'string' ? val : undefined;
  }

  private userRol(req: Request): string | undefined {
    return (req as { user?: { rol?: string } }).user?.rol;
  }

  private userId(req: Request): string | undefined {
    return (req as { user?: { id?: string } }).user?.id;
  }

  private isAdminRol(rol?: string): boolean {
    const r = (rol || '').toLowerCase();
    return r === 'admin' || r === 'administrador';
  }

  private prestamosQueryFromRequest(req: Request) {
    const user = (req as { user?: { id?: string; rol?: string } }).user;
    const isAdmin = this.isAdminRol(user?.rol);
    return {
      estado: this.str(req.query.estado),
      page: req.query.page ? parseInt(String(req.query.page), 10) : undefined,
      limit: req.query.limit ? parseInt(String(req.query.limit), 10) : undefined,
      fechaInicio: this.str(req.query.fechaInicio),
      fechaFin: this.str(req.query.fechaFin),
      searchTool: this.str(req.query.searchTool),
      filterPersona: this.str(req.query.filterPersona),
      ...(!isAdmin && user?.id ? { responsableId: user.id } : {}),
    };
  }

  // ── Materiales ──────────────────────────────────────────────────────────────

  async listMateriales(req: Request, res: Response) {
    try {
      const tipo = this.str(req.query.tipo);
      const page = req.query.page ? parseInt(String(req.query.page), 10) : undefined;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
      const search = this.str(req.query.search);
      const categoria = resolveInventarioCategoria(this.userRol(req), this.str(req.query.categoria));

      const data = await this.service.getInventario({ tipo, page, limit, search, categoria });
      return this.ok(res, data);
    } catch (e) { return this.fail(res, e); }
  }

  async getStats(req: Request, res: Response) {
    try {
      const data = await this.service.getStats();
      return this.ok(res, data);
    } catch (e) { return this.fail(res, e); }
  }

  async listUnidadesMedida(req: Request, res: Response) {
    try {
      const data = await this.service.getUnidadesMedida();
      return this.ok(res, data);
    } catch (e) { return this.fail(res, e); }
  }

  async createMaterial(req: Request, res: Response) {
    try {
      const body = { ...req.body };
      const categoriaRol = resolveInventarioCategoria(this.userRol(req));
      if (categoriaRol) {
        body.categoria = categoriaRol;
      }
      const data = await this.service.createMaterial(body);
      return res.status(201).json({ success: true, data });
    } catch (e) { return this.fail(res, e); }
  }

  async downloadImportTemplate(req: Request, res: Response) {
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
    } catch (e) { return this.fail(res, e, 400); }
  }

  async importMateriales(req: Request, res: Response) {
    try {
      const body = req.body as { categoria?: string; items?: unknown[] };
      const categoriaRol = getInventarioCategoriaPorRol(this.userRol(req));
      const categoria = categoriaRol || body.categoria;

      if (!categoria || !isCategoriaValida(categoria)) {
        return this.fail(res, new Error('Categoría inválida o no especificada.'), 400);
      }

      const items = Array.isArray(body.items) ? body.items : [];
      const result = await this.service.importMateriales(categoria, items as Parameters<InventarioService['importMateriales']>[1]);
      return res.status(201).json({ success: true, data: result });
    } catch (e) { return this.fail(res, e, 400); }
  }

  async importMaterialesFromFile(req: Request, res: Response) {
    try {
      const file = (req as any).file as Express.Multer.File | undefined;
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
    } catch (e) { return this.fail(res, e, 400); }
  }

  async updateMaterial(req: Request, res: Response) {
    try {
      const data = await this.service.updateMaterial(String(req.params.id), req.body);
      return this.ok(res, data);
    } catch (e) { return this.fail(res, e); }
  }

  async deleteMaterial(req: Request, res: Response) {
    try {
      await this.service.deleteMaterial(String(req.params.id));
      return this.ok(res, { deleted: true });
    } catch (e) { return this.fail(res, e); }
  }

  // ── Movimientos ──────────────────────────────────────────────────────────────

  async listMovimientos(req: Request, res: Response) {
    try {
      const data = await this.service.getMovimientos(this.str(req.query.materialId));
      return this.ok(res, data);
    } catch (e) { return this.fail(res, e); }
  }

  async createMovimiento(req: Request, res: Response) {
    try {
      const body = req.body as Record<string, unknown>;
      const fecha = body.fecha ? new Date(String(body.fecha)) : undefined;
      const data = await this.service.registrarMovimiento({
        ...body,
        materialId: String(req.params.id),
        ...(fecha && !Number.isNaN(fecha.getTime()) ? { fecha } : {}),
      } as Parameters<InventarioService['registrarMovimiento']>[0]);
      return res.status(201).json({ success: true, data });
    } catch (e) { return this.fail(res, e, 400); }
  }

  // ── Préstamos ────────────────────────────────────────────────────────────────

  async listPrestamos(req: Request, res: Response) {
    try {
      const data = await this.service.getPrestamos(this.prestamosQueryFromRequest(req));
      return this.ok(res, data);
    } catch (e) { return this.fail(res, e); }
  }

  async createPrestamo(req: Request, res: Response) {
    try {
      const data = await this.service.registrarPrestamo(req.body);
      return res.status(201).json({ success: true, data });
    } catch (e) { return this.fail(res, e, 400); }
  }

  async returnPrestamo(req: Request, res: Response) {
    try {
      const observacion = typeof req.body?.observacionDevolucion === 'string'
        ? req.body.observacionDevolucion.trim()
        : undefined;
      const user = (req as { user?: { id?: string; rol?: string } }).user;
      const actorUserId = this.isAdminRol(user?.rol) ? undefined : user?.id;
      const data = await this.service.devolverPrestamo(
        String(req.params.id),
        observacion || undefined,
        actorUserId,
      );
      return this.ok(res, data);
    } catch (e) { return this.fail(res, e, 400); }
  }

  async getMaterialHistorial(req: Request, res: Response) {
    try {
      const data = await this.service.getMaterialHistorial(String(req.params.id));
      return this.ok(res, data);
    } catch (e) { return this.fail(res, e); }
  }
}
