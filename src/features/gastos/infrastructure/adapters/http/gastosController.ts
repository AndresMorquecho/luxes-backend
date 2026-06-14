import { Request, Response } from 'express';
import { GastosService } from '../../../application/services/GastosService.js';

export interface GastosController {
  listGastos(req: Request, res: Response): Promise<Response>;
  saveGasto(req: Request, res: Response): Promise<Response>;
  deleteGasto(req: Request, res: Response): Promise<Response>;
  listVehiculos(req: Request, res: Response): Promise<Response>;
  saveVehiculo(req: Request, res: Response): Promise<Response>;
  deleteVehiculo(req: Request, res: Response): Promise<Response>;
  listMantenimientos(req: Request, res: Response): Promise<Response>;
  saveMantenimiento(req: Request, res: Response): Promise<Response>;
  deleteMantenimiento(req: Request, res: Response): Promise<Response>;
}

const paramId = (req: Request): string => String(req.params.id);

export function createGastosController(service: GastosService): GastosController {
  const handleError = (res: Response, error: unknown, context: string) => {
    const message = error instanceof Error ? error.message : 'Error interno';
    const isValidation =
      message.includes('obligatorio') ||
      message.includes('inválido') ||
      message.includes('mayor') ||
      message.includes('encontrado');
    console.error(`[${context}]`, error);
    return res.status(isValidation ? 400 : 500).json({
      success: false,
      error: { code: isValidation ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR', message },
    });
  };

  return {
    async listGastos(_req, res) {
      try {
        return res.status(200).json({ success: true, data: await service.listGastos() });
      } catch (error) {
        return handleError(res, error, 'gastos/list');
      }
    },

    async saveGasto(req, res) {
      try {
        const body = req.body ?? {};
        const id = req.params.id ? String(req.params.id) : body.id ? String(body.id) : undefined;
        const data = await service.saveGasto({
          id,
          concepto: String(body.concepto ?? ''),
          categoria: body.categoria ? String(body.categoria) : 'oficina',
          fecha: String(body.fecha ?? ''),
          monto: Number(body.monto) || 0,
          proveedor: body.proveedor ? String(body.proveedor) : '',
          notas: body.notas ? String(body.notas) : '',
        });
        return res.status(id ? 200 : 201).json({ success: true, data });
      } catch (error) {
        return handleError(res, error, 'gastos/save');
      }
    },

    async deleteGasto(req, res) {
      try {
        return res.status(200).json({ success: true, data: await service.deleteGasto(paramId(req)) });
      } catch (error) {
        return handleError(res, error, 'gastos/delete');
      }
    },

    async listVehiculos(_req, res) {
      try {
        return res.status(200).json({ success: true, data: await service.listVehiculos() });
      } catch (error) {
        return handleError(res, error, 'vehiculos/list');
      }
    },

    async saveVehiculo(req, res) {
      try {
        const body = req.body ?? {};
        const id = req.params.id ? String(req.params.id) : body.id ? String(body.id) : undefined;
        const data = await service.saveVehiculo({
          id,
          placa: String(body.placa ?? ''),
          marca: body.marca ? String(body.marca) : '',
          modelo: body.modelo ? String(body.modelo) : '',
          anio: body.anio !== undefined && body.anio !== '' ? Number(body.anio) : null,
          color: body.color ? String(body.color) : '',
          kilometraje: body.kilometraje !== undefined ? Number(body.kilometraje) : 0,
          responsable: body.responsable ? String(body.responsable) : '',
          notas: body.notas ? String(body.notas) : '',
          estado: body.estado ? String(body.estado) : 'activo',
        });
        return res.status(id ? 200 : 201).json({ success: true, data });
      } catch (error) {
        return handleError(res, error, 'vehiculos/save');
      }
    },

    async deleteVehiculo(req, res) {
      try {
        return res.status(200).json({ success: true, data: await service.deleteVehiculo(paramId(req)) });
      } catch (error) {
        return handleError(res, error, 'vehiculos/delete');
      }
    },

    async listMantenimientos(req, res) {
      try {
        return res.status(200).json({
          success: true,
          data: await service.listMantenimientos(paramId(req)),
        });
      } catch (error) {
        return handleError(res, error, 'mantenimientos/list');
      }
    },

    async saveMantenimiento(req, res) {
      try {
        const body = req.body ?? {};
        const mantId = req.params.mantId ? String(req.params.mantId) : body.id ? String(body.id) : undefined;
        const vehiculoId = req.params.id
          ? String(req.params.id)
          : body.vehiculoId
            ? String(body.vehiculoId)
            : '';
        const data = await service.saveMantenimiento({
          id: mantId,
          vehiculoId,
          tipo: String(body.tipo ?? ''),
          descripcion: body.descripcion ? String(body.descripcion) : '',
          fechaRealizado: String(body.fechaRealizado ?? ''),
          fechaProxima: body.fechaProxima ? String(body.fechaProxima) : '',
          kilometraje: body.kilometraje !== undefined && body.kilometraje !== '' ? Number(body.kilometraje) : null,
          kmProximo: body.kmProximo !== undefined && body.kmProximo !== '' ? Number(body.kmProximo) : null,
          monto: body.monto !== undefined ? Number(body.monto) : 0,
          proveedor: body.proveedor ? String(body.proveedor) : '',
          notas: body.notas ? String(body.notas) : '',
        });
        return res.status(mantId ? 200 : 201).json({ success: true, data });
      } catch (error) {
        return handleError(res, error, 'mantenimientos/save');
      }
    },

    async deleteMantenimiento(req, res) {
      try {
        return res.status(200).json({
          success: true,
          data: await service.deleteMantenimiento(paramId(req)),
        });
      } catch (error) {
        return handleError(res, error, 'mantenimientos/delete');
      }
    },
  };
}
