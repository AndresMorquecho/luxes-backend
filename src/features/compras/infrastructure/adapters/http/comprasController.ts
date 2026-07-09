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
      const estadosRaw = this.str(req.query.estados);
      const estados = estadosRaw
        ? estadosRaw.split(',').map((s) => s.trim()).filter(Boolean)
        : undefined;
      const estadoPago = this.str(req.query.estadoPago);
      const proveedorId = this.str(req.query.proveedorId);
      const creadorRol = this.str(req.query.creadorRol);
      const creadorId = this.str(req.query.creadorId);
      const pendienteRecepcion = req.query.pendienteRecepcion === 'true' || req.query.pendienteRecepcion === '1';
      const proyectoId = this.str(req.query.proyectoId);

      const data = await this.service.getOrdenes({
        page,
        limit,
        search,
        estado,
        estados,
        estadoPago,
        proveedorId,
        creadorRol,
        creadorId,
        pendienteRecepcion,
        proyectoId,
      });
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

  async getOrdenDetalles(req: Request, res: Response) {
    try {
      const data = await this.service.getOrdenDetalles(String(req.params.id));
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
      const user = (req as any).user;
      const userId = user?.id;
      const id = String(req.params.id);
      const orden = await this.service.getOrdenById(id);
      if (!orden) {
        return res.status(404).json({ success: false, error: { message: 'Orden no encontrada.' } });
      }

      const rol = (user?.rol || '').toLowerCase();
      const isAdmin = rol === 'admin' || rol === 'administrador';
      const hasAprobacion = isAdmin || user?.permissions?.includes('aprobacion_ordenes_compra');

      const updateData = { ...req.body };
      const isApprovalAction =
        updateData.estado === 'aprobada' || updateData.estado === 'rechazada';

      if (isApprovalAction && !hasAprobacion) {
        return res.status(403).json({
          success: false,
          error: { message: 'No tienes permiso para aprobar o rechazar órdenes.' },
        });
      }

      if (!isApprovalAction && orden.estado !== 'aprobada') {
        return res.status(400).json({
          success: false,
          error: { message: 'Solo se pueden editar órdenes aprobadas. Las pendientes deben gestionarse desde aprobación.' },
        });
      }

      if (!isApprovalAction && !hasAprobacion) {
        return res.status(403).json({
          success: false,
          error: { message: 'No tienes permiso para modificar esta orden.' },
        });
      }

      const esNuevaAprobacion =
        updateData.estado === 'aprobada' && orden.estado !== 'aprobada';
      // Evitar re-aprobación accidental al editar una orden ya aprobada
      if (orden.estado === 'aprobada' && updateData.estado === 'aprobada') {
        delete updateData.estado;
        delete updateData.aprobadoPorId;
      }

      // Abono: solo en aprobación nueva o en edición con flag explícito
      const esAprobacionConAbono =
        esNuevaAprobacion && Number(updateData.abonoMonto) > 0;
      const esAjusteFinanciero = updateData.registrarAbonoAjuste === true;
      if (!esAprobacionConAbono && !esAjusteFinanciero) {
        delete updateData.abonoMonto;
        delete updateData.metodoPagoId;
        delete updateData.abonoReferencia;
      }
      delete updateData.registrarAbonoAjuste;

      if (updateData.estado === 'aprobada' && userId) {
        updateData.aprobadoPorId = userId;
      }

      if (updateData.abonoMonto && userId) {
        updateData.registradoPorUserId = userId;
      }

      const data = await this.service.updateOrden(id, updateData);
      return this.ok(res, data);
    } catch (e) { return this.fail(res, e, 400); }
  }

  async restoreOrdenDetalles(req: Request, res: Response) {
    try {
      const user = (req as any).user;
      const userId = user?.id;
      const id = String(req.params.id);
      const orden = await this.service.getOrdenById(id);
      if (!orden) {
        return res.status(404).json({ success: false, error: { message: 'Orden no encontrada.' } });
      }

      const rol = (user?.rol || '').toLowerCase();
      const isAdmin = rol === 'admin' || rol === 'administrador';
      const hasAprobacion = isAdmin || user?.permissions?.includes('aprobacion_ordenes_compra');
      const isCreatorPending =
        orden.usuarioId === userId && orden.estado === 'pendiente_aprobacion';

      if (!hasAprobacion && !isCreatorPending) {
        return res.status(403).json({
          success: false,
          error: { message: 'No tienes permiso para restaurar detalles de esta orden.' },
        });
      }

      const detalles = Array.isArray(req.body?.detalles) ? req.body.detalles : [];
      const data = await this.service.restoreOrdenDetalles(id, detalles);
      return this.ok(res, data);
    } catch (e) { return this.fail(res, e, 400); }
  }

  async deleteOrden(req: Request, res: Response) {
    try {
      await this.service.deleteOrden(String(req.params.id));
      return this.ok(res, { deleted: true });
    } catch (e) { return this.fail(res, e); }
  }

  async editarOrden(req: Request, res: Response) {
    try {
      const user = (req as any).user;
      const rol = (user?.rol || '').toLowerCase();
      const isAdmin = rol === 'admin' || rol === 'administrador';
      const hasPermiso = isAdmin || user?.permissions?.includes('aprobacion_ordenes_compra');
      if (!hasPermiso) {
        return res.status(403).json({
          success: false,
          error: { message: 'Solo los administradores pueden editar órdenes con anulación y reemplazo.' },
        });
      }

      const id = String(req.params.id);
      const { fecha, concepto, notas, proyectoId, impuesto, detalles, abonoMonto, metodoPagoId, abonoReferencia } = req.body;

      if (!Array.isArray(detalles) || detalles.length === 0) {
        return res.status(400).json({
          success: false,
          error: { message: 'Debe incluir al menos un ítem en la orden.' },
        });
      }

      const data = await this.service.editarOrden(id, {
        fecha,
        concepto,
        notas,
        proyectoId: proyectoId || null,
        impuesto: parseFloat(impuesto) || 0,
        detalles,
        editadoPorId: user.id,
        abonoMonto: abonoMonto ? parseFloat(abonoMonto) : undefined,
        metodoPagoId: metodoPagoId || null,
        abonoReferencia: abonoReferencia || undefined,
      });
      return this.ok(res, data);
    } catch (e) { return this.fail(res, e, 400); }
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
      const userId = (req as { user?: { id?: string } }).user?.id || null;

      // Verificar si la fecha del abono cae en un período cerrado de caja
      const { prisma } = await import('../../../../../config/prismaClient.js');
      const fechaAbono = req.body.fecha ? new Date(req.body.fecha) : new Date();
      const cierreBloqueante = await prisma.cierreCaja.findFirst({
        where: {
          fechaInicio: { lte: new Date(fechaAbono.getFullYear(), fechaAbono.getMonth(), fechaAbono.getDate(), 23, 59, 59, 999) },
          fechaFin: { gte: new Date(fechaAbono.getFullYear(), fechaAbono.getMonth(), fechaAbono.getDate(), 0, 0, 0, 0) },
        },
      });
      if (cierreBloqueante) {
        const fi = cierreBloqueante.fechaInicio.toISOString().split('T')[0];
        const ff = cierreBloqueante.fechaFin.toISOString().split('T')[0];
        return res.status(403).json({ success: false, error: { code: 'PERIODO_CERRADO', message: `No se pueden registrar pagos a OC en un período cerrado (${fi} al ${ff}). Elimine el cierre de caja primero.` } });
      }

      const data = await this.service.registrarAbono({
        ...req.body,
        ordenCompraId: String(req.params.id),
        registradoPorUserId: userId,
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

  async listMetodosPago(req: Request, res: Response) {
    try {
      const { desde, hasta } = req.query;
      let desdeDate: Date | undefined;
      let hastaLimit: Date | undefined;

      if (desde && hasta) {
        const desdeStr = String(desde);
        desdeDate = desdeStr.includes('T') ? new Date(desdeStr) : new Date(desdeStr + 'T00:00:00');
        const hastaStr = String(hasta);
        hastaLimit = hastaStr.includes('T') ? new Date(hastaStr) : new Date(hastaStr + 'T23:59:59.999');
      }

      const data = await this.service.getMetodosPago(desdeDate, hastaLimit);
      return this.ok(res, data);
    } catch (e) { return this.fail(res, e); }
  }

  async createMetodoPago(req: Request, res: Response) {
    try {
      const { nombre, descripcion, tipo } = req.body || {};
      const data = await this.service.createMetodoPago({ nombre, descripcion, tipo });
      return res.status(201).json({ success: true, data });
    } catch (e) { return this.fail(res, e, 400); }
  }

  async updateMetodoPago(req: Request, res: Response) {
    try {
      const { nombre, descripcion, activo, tipo } = req.body || {};
      const data = await this.service.updateMetodoPago(String(req.params.id), { nombre, descripcion, activo, tipo });
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

      const { detalles, fechaRecepcion, notasRecepcion } = req.body;
      if (!Array.isArray(detalles)) {
        throw new Error('Los detalles recibidos son requeridos y deben ser un arreglo.');
      }

      const data = await this.service.recepcionarOrden(id, userId, {
        fechaRecepcion,
        notasRecepcion,
        detalles,
      });
      return this.ok(res, data);
    } catch (e) {
      return this.fail(res, e, 400);
    }
  }
}
