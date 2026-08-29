import type { Request, Response } from 'express';
import { RutinasService } from '../../../application/services/RutinasService.js';

export class RutinasController {
  constructor(private service: RutinasService) {}

  async list(req: Request, res: Response) {
    try {
      const data = await this.service.listRutinas();
      return res.json({ success: true, data });
    } catch (e: any) {
      return res.status(500).json({ success: false, error: { message: e.message } });
    }
  }

  async getById(req: Request, res: Response) {
    try {
      const data = await this.service.getRutinaById(String(req.params.id));
      if (!data) return res.status(404).json({ success: false, error: { message: 'Rutina no encontrada' } });
      return res.json({ success: true, data });
    } catch (e: any) {
      return res.status(500).json({ success: false, error: { message: e.message } });
    }
  }

  async create(req: Request, res: Response) {
    try {
      const user = (req as any).user;
      const { titulo, descripcion, frecuencia, diasSemana, turnosPorDia, diaDelMes, horaNotificacion, color, activo, empleadosIds } = req.body;
      if (!titulo) {
        return res.status(400).json({ success: false, error: { message: 'El título es obligatorio' } });
      }

      const data = await this.service.createRutina({
        titulo,
        descripcion,
        frecuencia,
        diasSemana,
        turnosPorDia,
        diaDelMes,
        horaNotificacion,
        color,
        activo,
        empleadosIds,
        creadoPorId: user?.id,
      });
      return res.status(201).json({ success: true, data });
    } catch (e: any) {
      return res.status(400).json({ success: false, error: { message: e.message } });
    }
  }

  async update(req: Request, res: Response) {
    try {
      const data = await this.service.updateRutina(String(req.params.id), req.body);
      return res.json({ success: true, data });
    } catch (e: any) {
      return res.status(400).json({ success: false, error: { message: e.message } });
    }
  }

  async delete(req: Request, res: Response) {
    try {
      await this.service.deleteRutina(String(req.params.id));
      return res.json({ success: true, data: { deleted: true } });
    } catch (e: any) {
      return res.status(400).json({ success: false, error: { message: e.message } });
    }
  }

  async toggleCompletada(req: Request, res: Response) {
    try {
      const { fecha, empleadoId, notas } = req.body;
      if (!fecha) {
        return res.status(400).json({ success: false, error: { message: 'La fecha es obligatoria (YYYY-MM-DD)' } });
      }
      const data = await this.service.toggleCompletada(String(req.params.id), fecha, empleadoId, notas);
      return res.json({ success: true, data });
    } catch (e: any) {
      return res.status(400).json({ success: false, error: { message: e.message } });
    }
  }
}
