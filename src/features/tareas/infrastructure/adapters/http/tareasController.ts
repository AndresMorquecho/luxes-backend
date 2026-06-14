import type { Request, Response } from 'express';
import type { TareasService } from '../../../application/services/TareasService.js';

export class TareasController {
  constructor(private readonly service: TareasService) {}

  private ok(res: Response, data: unknown) {
    return res.json({ success: true, data });
  }

  private fail(res: Response, err: unknown, status = 500) {
    const message = err instanceof Error ? err.message : 'Error interno del servidor.';
    return res.status(status).json({ success: false, error: { message } });
  }

  // ── List all tasks (admin) ─────────────────────────────────────────────────
  async listTareas(req: Request, res: Response) {
    try {
      const page = req.query.page ? parseInt(String(req.query.page), 10) : undefined;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
      const estado = typeof req.query.estado === 'string' ? req.query.estado : undefined;
      const prioridad = typeof req.query.prioridad === 'string' ? req.query.prioridad : undefined;
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;

      const data = await this.service.getTareas({ page, limit, estado, prioridad, search });
      return this.ok(res, data);
    } catch (e) { return this.fail(res, e); }
  }

  // ── List my assigned tasks (any user) ──────────────────────────────────────
  async getMyTareas(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      if (!userId) throw new Error('Usuario no autenticado.');

      const page = req.query.page ? parseInt(String(req.query.page), 10) : undefined;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
      const estado = typeof req.query.estado === 'string' ? req.query.estado : undefined;
      const prioridad = typeof req.query.prioridad === 'string' ? req.query.prioridad : undefined;

      const data = await this.service.getMisTareas(userId, { page, limit, estado, prioridad });
      return this.ok(res, data);
    } catch (e) { return this.fail(res, e); }
  }

  // ── Get task by ID ─────────────────────────────────────────────────────────
  async getTareaById(req: Request, res: Response) {
    try {
      const data = await this.service.getTareaById(String(req.params.id));
      if (!data) return res.status(404).json({ success: false, error: { message: 'Tarea no encontrada.' } });
      return this.ok(res, data);
    } catch (e) { return this.fail(res, e); }
  }

  // ── Create task (admin) ────────────────────────────────────────────────────
  async createTarea(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      if (!userId) throw new Error('Usuario no autenticado.');

      const data = await this.service.createTarea({
        ...req.body,
        creadoPorId: userId,
      });
      return res.status(201).json({ success: true, data });
    } catch (e) { return this.fail(res, e, 400); }
  }

  // ── Update task ────────────────────────────────────────────────────────────
  async updateTarea(req: Request, res: Response) {
    try {
      const data = await this.service.updateTarea(String(req.params.id), req.body);
      return this.ok(res, data);
    } catch (e) { return this.fail(res, e, 400); }
  }

  // ── Delete task (admin) ────────────────────────────────────────────────────
  async deleteTarea(req: Request, res: Response) {
    try {
      await this.service.deleteTarea(String(req.params.id));
      return this.ok(res, { deleted: true });
    } catch (e) { return this.fail(res, e); }
  }

  // ── Stats ──────────────────────────────────────────────────────────────────
  async getStats(req: Request, res: Response) {
    try {
      const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
      const data = await this.service.getStats(userId);
      return this.ok(res, data);
    } catch (e) { return this.fail(res, e); }
  }
}
