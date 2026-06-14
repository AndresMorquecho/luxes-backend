import { Request, Response } from 'express';
import { NominaService } from '../../../application/services/NominaService.js';

export interface NominaController {
  listAsistencias(req: Request, res: Response): Promise<Response>;
  getProximaMarcacion(req: Request, res: Response): Promise<Response>;
  registrarAsistencia(req: Request, res: Response): Promise<Response>;
  listVacaciones(req: Request, res: Response): Promise<Response>;
  upsertVacacion(req: Request, res: Response): Promise<Response>;
  listHorasExtras(req: Request, res: Response): Promise<Response>;
  saveHorasExtrasBulk(req: Request, res: Response): Promise<Response>;
  listNominas(req: Request, res: Response): Promise<Response>;
  saveNomina(req: Request, res: Response): Promise<Response>;
}

const queryString = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value[0];
  return undefined;
};

const paramString = (value: string | string[]): string => String(value);

export function createNominaController(nominaService: NominaService): NominaController {
  return {
    async listAsistencias(req, res) {
      try {
        const data = await nominaService.listAsistencias({
          fechaInicio: queryString(req.query.fechaInicio),
          fechaFin: queryString(req.query.fechaFin),
          empleadoId: queryString(req.query.empleadoId),
        });
        return res.status(200).json({ success: true, data });
      } catch (error) {
        console.error('[asistencias/list]', error);
        return res.status(500).json({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Error al obtener asistencias' },
        });
      }
    },

    async getProximaMarcacion(req, res) {
      try {
        const data = await nominaService.getProximaMarcacion(paramString(req.params.empleadoId));
        return res.status(200).json({ success: true, data });
      } catch (error) {
        console.error('[asistencias/proxima]', error);
        return res.status(500).json({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Error al obtener próxima marcación' },
        });
      }
    },

    async registrarAsistencia(req, res) {
      try {
        const { empleadoId, ubicacion } = req.body ?? {};
        if (!empleadoId) {
          return res.status(400).json({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'empleadoId es obligatorio' },
          });
        }

        const data = await nominaService.registrarAsistencia({ empleadoId, ubicacion });
        return res.status(201).json({ success: true, data });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Error al registrar asistencia';
        const status = message.includes('no encontrado') || message.includes('completó') ? 400 : 500;
        console.error('[asistencias/create]', error);
        return res.status(status).json({
          success: false,
          error: { code: status === 400 ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR', message },
        });
      }
    },

    async listVacaciones(req, res) {
      try {
        const anio = Number(queryString(req.query.anio) ?? new Date().getFullYear());
        const data = await nominaService.listVacaciones(anio);
        return res.status(200).json({ success: true, data });
      } catch (error) {
        console.error('[vacaciones/list]', error);
        return res.status(500).json({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Error al obtener vacaciones' },
        });
      }
    },

    async upsertVacacion(req, res) {
      try {
        const { empleadoId, anio, diasTomados } = req.body ?? {};
        if (!empleadoId || !anio) {
          return res.status(400).json({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'empleadoId y anio son obligatorios' },
          });
        }

        const data = await nominaService.upsertVacacion({
          empleadoId,
          anio: Number(anio),
          diasTomados: Array.isArray(diasTomados) ? diasTomados : [],
        });
        return res.status(200).json({ success: true, data });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Error al guardar vacaciones';
        const status = message.includes('no encontrado') ? 404 : 500;
        console.error('[vacaciones/upsert]', error);
        return res.status(status).json({
          success: false,
          error: { code: status === 404 ? 'NOT_FOUND' : 'INTERNAL_ERROR', message },
        });
      }
    },

    async listHorasExtras(req, res) {
      try {
        const fechaInicio = queryString(req.query.fechaInicio);
        const fechaFin = queryString(req.query.fechaFin);
        if (!fechaInicio || !fechaFin) {
          return res.status(400).json({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'fechaInicio y fechaFin son obligatorios' },
          });
        }

        const data = await nominaService.listHorasExtras(fechaInicio, fechaFin);
        return res.status(200).json({ success: true, data });
      } catch (error) {
        console.error('[horas-extras/list]', error);
        return res.status(500).json({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Error al obtener horas extras' },
        });
      }
    },

    async saveHorasExtrasBulk(req, res) {
      try {
        const { fechaInicio, fechaFin, records } = req.body ?? {};
        if (!fechaInicio || !fechaFin || !Array.isArray(records)) {
          return res.status(400).json({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'fechaInicio, fechaFin y records son obligatorios' },
          });
        }

        const data = await nominaService.saveHorasExtrasBulk(fechaInicio, fechaFin, records);
        return res.status(200).json({ success: true, data });
      } catch (error) {
        console.error('[horas-extras/bulk]', error);
        return res.status(500).json({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Error al guardar horas extras' },
        });
      }
    },

    async listNominas(req, res) {
      try {
        const fechaInicio = queryString(req.query.fechaInicio);
        const fechaFin = queryString(req.query.fechaFin);
        if (!fechaInicio || !fechaFin) {
          return res.status(400).json({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'fechaInicio y fechaFin son obligatorios' },
          });
        }

        const data = await nominaService.listNominas(fechaInicio, fechaFin);
        return res.status(200).json({ success: true, data });
      } catch (error) {
        console.error('[nominas/list]', error);
        return res.status(500).json({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Error al obtener nóminas' },
        });
      }
    },

    async saveNomina(req, res) {
      try {
        const body = req.body ?? {};
        if (!body.empleadoId || !body.fechaInicio || !body.fechaFin) {
          return res.status(400).json({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'empleadoId, fechaInicio y fechaFin son obligatorios' },
          });
        }

        const data = await nominaService.saveNomina(body);
        return res.status(200).json({ success: true, data });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Error al guardar nómina';
        const status = message.includes('no encontrado') ? 400 : 500;
        console.error('[nominas/save]', error);
        return res.status(status).json({
          success: false,
          error: { code: status === 400 ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR', message },
        });
      }
    },
  };
}
