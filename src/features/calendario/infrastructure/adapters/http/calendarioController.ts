import type { Request, Response } from 'express';
import { CalendarioService } from '../../../application/services/CalendarioService.js';

export class CalendarioController {
  constructor(private service: CalendarioService) {}

  async getEventos(req: Request, res: Response) {
    try {
      const mesParam = (req.query.mes as string) || new Date().toISOString().slice(0, 7);
      const data = await this.service.getEventosDelMes(mesParam);
      return res.json({ success: true, data });
    } catch (e: any) {
      return res.status(500).json({ success: false, error: { message: e.message } });
    }
  }
}
