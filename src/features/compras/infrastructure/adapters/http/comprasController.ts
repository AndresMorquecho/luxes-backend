import type { Request, Response } from 'express';
import type { ComprasService } from '../../../application/services/ComprasService.js';

export class ComprasController {
  constructor(private readonly service: ComprasService) {}

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

  // ── Proveedores ────────────────────────────────────────────────────────────

  async listProveedores(_req: Request, res: Response) {
    try {
      const data = await this.service.getProveedores();
      return this.ok(res, data);
    } catch (e) { return this.fail(res, e); }
  }

  async createProveedor(req: Request, res: Response) {
    try {
      const data = await this.service.createProveedor(req.body);
      return res.status(201).json({ success: true, data });
    } catch (e) { return this.fail(res, e, 400); }
  }

  async updateProveedor(req: Request, res: Response) {
    try {
      const data = await this.service.updateProveedor(String(req.params.id), req.body);
      return this.ok(res, data);
    } catch (e) { return this.fail(res, e, 400); }
  }

  async deleteProveedor(req: Request, res: Response) {
    try {
      await this.service.deleteProveedor(String(req.params.id));
      return this.ok(res, { deleted: true });
    } catch (e) { return this.fail(res, e); }
  }

  // ── Órdenes de Compra ──────────────────────────────────────────────────────

  async listOrdenes(req: Request, res: Response) {
    try {
      const page = req.query.page ? parseInt(String(req.query.page), 10) : undefined;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
      const search = this.str(req.query.search);
      const estado = this.str(req.query.estado);
      const estadoPago = this.str(req.query.estadoPago);
      const creadorRol = this.str(req.query.creadorRol);

      const data = await this.service.getOrdenes({ page, limit, search, estado, estadoPago, creadorRol });
      return this.ok(res, data);
    } catch (e) { return this.fail(res, e); }
  }

  async getOrdenById(req: Request, res: Response) {
    try {
      const data = await this.service.getOrdenById(String(req.params.id));
      if (!data) return res.status(404).json({ success: false, error: { message: 'Orden no encontrada.' } });
      return this.ok(res, data);
    } catch (e) { return this.fail(res, e); }
  }

  async createOrden(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        throw new Error('Usuario no autenticado o sesión inválida.');
      }
      const data = await this.service.createOrden({
        ...req.body,
        usuarioId: userId,
      });
      return res.status(201).json({ success: true, data });
    } catch (e) { return this.fail(res, e, 400); }
  }

  async updateOrden(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      const updateData = { ...req.body };
      
      // Si se está aprobando la orden, agregar el usuario que aprueba
      if (updateData.estado === 'aprobada' && userId) {
        updateData.aprobadoPorId = userId;
      }
      
      const data = await this.service.updateOrden(String(req.params.id), updateData);
      return this.ok(res, data);
    } catch (e) { return this.fail(res, e, 400); }
  }

  async deleteOrden(req: Request, res: Response) {
    try {
      await this.service.deleteOrden(String(req.params.id));
      return this.ok(res, { deleted: true });
    } catch (e) { return this.fail(res, e); }
  }

  // ── Abonos ─────────────────────────────────────────────────────────────────

  async listAbonos(req: Request, res: Response) {
    try {
      const data = await this.service.getAbonosByOrden(String(req.params.id));
      return this.ok(res, data);
    } catch (e) { return this.fail(res, e); }
  }

  async createAbono(req: Request, res: Response) {
    try {
      const data = await this.service.registrarAbono({
        ...req.body,
        ordenCompraId: String(req.params.id),
      });
      return res.status(201).json({ success: true, data });
    } catch (e) { return this.fail(res, e, 400); }
  }

  // ── Cuentas por Pagar ──────────────────────────────────────────────────────

  async listCuentasPorPagar(req: Request, res: Response) {
    try {
      const page = req.query.page ? parseInt(String(req.query.page), 10) : undefined;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
      const estado = this.str(req.query.estado);

      const data = await this.service.getCuentasPorPagar({ page, limit, estado });
      return this.ok(res, data);
    } catch (e) { return this.fail(res, e); }
  }

  // ── Métodos de Pago ────────────────────────────────────────────────────────

  async listMetodosPago(_req: Request, res: Response) {
    try {
      const data = await this.service.getMetodosPago();
      return this.ok(res, data);
    } catch (e) { return this.fail(res, e); }
  }

  async createMetodoPago(req: Request, res: Response) {
    try {
      const data = await this.service.createMetodoPago(req.body);
      return res.status(201).json({ success: true, data });
    } catch (e) { return this.fail(res, e, 400); }
  }

  async updateMetodoPago(req: Request, res: Response) {
    try {
      const data = await this.service.updateMetodoPago(String(req.params.id), req.body);
      return this.ok(res, data);
    } catch (e) { return this.fail(res, e, 400); }
  }

  async deleteMetodoPago(req: Request, res: Response) {
    try {
      await this.service.deleteMetodoPago(String(req.params.id));
      return this.ok(res, { deleted: true });
    } catch (e) { return this.fail(res, e); }
  }

  // ── Stats ──────────────────────────────────────────────────────────────────

  async getStats(_req: Request, res: Response) {
    try {
      const data = await this.service.getComprasStats();
      return this.ok(res, data);
    } catch (e) { return this.fail(res, e); }
  }

  async recepcionarOrden(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      const userId = (req as any).user?.id;
      if (!userId) {
        throw new Error('Usuario no autenticado o sesión inválida.');
      }

      const { detalles } = req.body;
      if (!Array.isArray(detalles)) {
        throw new Error('Los detalles recibidos son requeridos y deben ser un arreglo.');
      }

      const data = await this.service.recepcionarOrden(id, userId, detalles);
      return this.ok(res, data);
    } catch (e) {
      return this.fail(res, e, 400);
    }
  }
}
