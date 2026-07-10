import type { Request, Response } from 'express';
import type { GuiaRemisionService } from '../../../application/services/GuiaRemisionService.js';

export class GuiaRemisionController {
  constructor(private readonly service: GuiaRemisionService) {}

  private ok(res: Response, data: unknown) {
    return res.json({ success: true, data });
  }

  private fail(res: Response, err: unknown, status = 500) {
    const message = err instanceof Error ? err.message : 'Error interno del servidor.';
    return res.status(status).json({ success: false, error: { message } });
  }

  async emitir(req: Request, res: Response) {
    try {
      const data = await this.service.emitirGuia(req.body);
      return res.status(201).json({ success: true, data });
    } catch (e) {
      return this.fail(res, e, 400);
    }
  }

  async consultarEstado(req: Request, res: Response) {
    try {
      const { id } = req.params;
      if (!id) {
        throw new Error('El ID del comprobante es requerido.');
      }
      const data = await this.service.consultarEstado(String(id));
      return this.ok(res, data);
    } catch (e) {
      return this.fail(res, e, 400);
    }
  }
}
