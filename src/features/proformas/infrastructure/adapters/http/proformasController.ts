import { Request, Response } from 'express';
import { ProformasService } from '../../../application/services/ProformasService.js';

export interface ProformasController {
  listProformas(req: Request, res: Response): Promise<Response>;
  saveProforma(req: Request, res: Response): Promise<Response>;
  updateProformaEstado(req: Request, res: Response): Promise<Response>;
  deleteProforma(req: Request, res: Response): Promise<Response>;
}

const paramId = (req: Request): string => String(req.params.id);

export function createProformasController(service: ProformasService): ProformasController {
  const handleError = (res: Response, error: unknown, context: string, validationStatus = 400) => {
    const message = error instanceof Error ? error.message : 'Error interno';
    const isValidation =
      message.includes('obligatorio') ||
      message.includes('inválido') ||
      message.includes('al menos');
    console.error(`[${context}]`, error);
    return res.status(isValidation ? validationStatus : 500).json({
      success: false,
      error: {
        code: isValidation ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR',
        message,
      },
    });
  };

  return {
    async listProformas(_req, res) {
      try {
        const data = await service.listProformas();
        return res.status(200).json({ success: true, data });
      } catch (error) {
        return handleError(res, error, 'proformas/list', 500);
      }
    },

    async saveProforma(req, res) {
      try {
        const body = req.body ?? {};
        const id = req.params.id ? String(req.params.id) : body.id ? String(body.id) : undefined;
        const data = await service.saveProforma({
          id,
          clienteId: body.clienteId ? String(body.clienteId) : null,
          cliente: String(body.cliente ?? ''),
          telefono: body.telefono ? String(body.telefono) : '',
          email: body.email ? String(body.email) : '',
          fecha: String(body.fecha ?? ''),
          vencimiento: body.vencimiento ? String(body.vencimiento) : '',
          items: Array.isArray(body.items) ? body.items : [],
          iva: body.iva !== undefined ? Number(body.iva) : 0.12,
          notas: body.notas ? String(body.notas) : '',
          estado: body.estado ? String(body.estado) : 'Pendiente',
        });
        return res.status(id ? 200 : 201).json({ success: true, data });
      } catch (error) {
        return handleError(res, error, 'proformas/save');
      }
    },

    async updateProformaEstado(req, res) {
      try {
        const estado = String(req.body?.estado ?? '');
        const data = await service.updateProformaEstado(paramId(req), estado);
        return res.status(200).json({ success: true, data });
      } catch (error) {
        return handleError(res, error, 'proformas/estado');
      }
    },

    async deleteProforma(req, res) {
      try {
        const data = await service.deleteProforma(paramId(req));
        return res.status(200).json({ success: true, data });
      } catch (error) {
        return handleError(res, error, 'proformas/delete', 500);
      }
    },
  };
}
