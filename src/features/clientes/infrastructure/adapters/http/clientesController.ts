import { Request, Response } from 'express';
import { ClientesService } from '../../../application/services/ClientesService.js';

export interface ClientesController {
  list(req: Request, res: Response): Promise<Response>;
  save(req: Request, res: Response): Promise<Response>;
  remove(req: Request, res: Response): Promise<Response>;
}

const paramId = (req: Request): string => String(req.params.id);

export function createClientesController(service: ClientesService): ClientesController {
  const handleError = (res: Response, error: unknown, context: string) => {
    const message = error instanceof Error ? error.message : 'Error interno';
    const isValidation = message.includes('obligatorio');
    console.error(`[${context}]`, error);
    return res.status(isValidation ? 400 : 500).json({
      success: false,
      error: {
        code: isValidation ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR',
        message,
      },
    });
  };

  return {
    async list(_req, res) {
      try {
        const data = await service.listClientes();
        return res.status(200).json({ success: true, data });
      } catch (error) {
        return handleError(res, error, 'clientes/list');
      }
    },

    async save(req, res) {
      try {
        const body = req.body ?? {};
        const id = req.params.id ? String(req.params.id) : body.id ? String(body.id) : undefined;
        const data = await service.saveCliente({
          id,
          nombre: String(body.nombre ?? ''),
          cedulaRuc: body.cedulaRuc ? String(body.cedulaRuc) : '',
          telefono: body.telefono ? String(body.telefono) : '',
          email: body.email ? String(body.email) : '',
          direccion: body.direccion ? String(body.direccion) : '',
          tipo: body.tipo ? String(body.tipo) : 'Persona',
          notas: body.notas ? String(body.notas) : '',
        });
        return res.status(id ? 200 : 201).json({ success: true, data });
      } catch (error) {
        return handleError(res, error, 'clientes/save');
      }
    },

    async remove(req, res) {
      try {
        const data = await service.deleteCliente(paramId(req));
        return res.status(200).json({ success: true, data });
      } catch (error) {
        return handleError(res, error, 'clientes/delete');
      }
    },
  };
}
