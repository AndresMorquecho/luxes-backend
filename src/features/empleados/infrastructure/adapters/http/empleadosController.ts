import { Request, Response } from 'express';
import { EmpleadoService } from '../../../application/services/EmpleadoService.js';
import { EmpleadoInput } from '../../../domain/ports/EmpleadoRepositoryPort.js';
import { EmpleadoDocumentoTipo } from '../../../domain/entities/EmpleadoDocumento.js';
import { isValidDocumentoTipo } from '../persistence/prismaEmpleadoDocumentoAdapter.js';

export interface EmpleadosController {
  list(req: Request, res: Response): Promise<Response>;
  getById(req: Request, res: Response): Promise<Response>;
  create(req: Request, res: Response): Promise<Response>;
  update(req: Request, res: Response): Promise<Response>;
  remove(req: Request, res: Response): Promise<Response>;
  listDocumentos(req: Request, res: Response): Promise<Response>;
  uploadDocumento(req: Request, res: Response): Promise<Response>;
  removeDocumento(req: Request, res: Response): Promise<Response>;
}

const parseBody = (body: Record<string, unknown>): EmpleadoInput => ({
  nombre: String(body.nombre ?? ''),
  cedula: String(body.cedula ?? ''),
  cargo: String(body.cargo ?? ''),
  departamento: String(body.departamento ?? ''),
  telefono: String(body.telefono ?? ''),
  correo: String(body.correo ?? ''),
  cuentaBanco: String(body.cuentaBanco ?? ''),
  banco: String(body.banco ?? ''),
  tipoContrato: String(body.tipoContrato ?? 'Fijo'),
  sueldoDiario: Number(body.sueldoDiario) || 0,
  direccion: String(body.direccion ?? ''),
  foto: body.foto ? String(body.foto) : null,
});

const paramId = (req: Request): string => String(req.params.id);

export function createEmpleadosController(empleadoService: EmpleadoService): EmpleadosController {
  return {
    async list(_req, res) {
      try {
        const empleados = await empleadoService.listEmpleados();
        return res.status(200).json({
          success: true,
          data: empleados.map((e) => e.toJSON()),
        });
      } catch (error) {
        console.error('[empleados/list]', error);
        return res.status(500).json({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Error al obtener empleados' },
        });
      }
    },

    async getById(req, res) {
      try {
        const empleado = await empleadoService.getEmpleadoById(paramId(req));
        if (!empleado) {
          return res.status(404).json({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Empleado no encontrado' },
          });
        }

        return res.status(200).json({
          success: true,
          data: {
            ...empleado.toJSON(),
            documentos: (await empleadoService.listDocumentos(paramId(req))).map((d) => d.toJSON()),
          },
        });
      } catch (error) {
        console.error('[empleados/getById]', error);
        return res.status(500).json({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Error al obtener empleado' },
        });
      }
    },

    async create(req, res) {
      try {
        const empleado = await empleadoService.createEmpleado(parseBody(req.body ?? {}));
        return res.status(201).json({
          success: true,
          data: empleado.toJSON(),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Error al crear empleado';
        const status = message.includes('cédula') || message.includes('obligator') ? 400 : 500;
        console.error('[empleados/create]', error);
        return res.status(status).json({
          success: false,
          error: { code: status === 400 ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR', message },
        });
      }
    },

    async update(req, res) {
      try {
        const empleado = await empleadoService.updateEmpleado(paramId(req), parseBody(req.body ?? {}));
        return res.status(200).json({
          success: true,
          data: empleado.toJSON(),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Error al actualizar empleado';
        const status = message.includes('no encontrado')
          ? 404
          : message.includes('cédula') || message.includes('obligator')
            ? 400
            : 500;
        console.error('[empleados/update]', error);
        return res.status(status).json({
          success: false,
          error: {
            code: status === 404 ? 'NOT_FOUND' : status === 400 ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR',
            message,
          },
        });
      }
    },

    async remove(req, res) {
      try {
        await empleadoService.deleteEmpleado(paramId(req));
        return res.status(200).json({
          success: true,
          data: { id: paramId(req) },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Error al eliminar empleado';
        const status = message.includes('no encontrado') ? 404 : 500;
        console.error('[empleados/remove]', error);
        return res.status(status).json({
          success: false,
          error: { code: status === 404 ? 'NOT_FOUND' : 'INTERNAL_ERROR', message },
        });
      }
    },

    async listDocumentos(req, res) {
      try {
        const documentos = await empleadoService.listDocumentos(paramId(req));
        return res.status(200).json({
          success: true,
          data: documentos.map((d) => d.toJSON()),
        });
      } catch (error) {
        console.error('[empleados/documentos/list]', error);
        return res.status(500).json({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Error al obtener documentos' },
        });
      }
    },

    async uploadDocumento(req, res) {
      try {
        const empleadoId = paramId(req);
        const file = req.file;
        const tipo = String(req.body?.tipo ?? '');
        const nombre = String(req.body?.nombre ?? file?.originalname ?? 'Documento');

        if (!file) {
          return res.status(400).json({
            success: false,
            error: { code: 'NO_FILE', message: 'No se recibió ningún archivo' },
          });
        }

        if (!isValidDocumentoTipo(tipo)) {
          return res.status(400).json({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'Tipo de documento inválido' },
          });
        }

        const documento = await empleadoService.addDocumento({
          empleadoId,
          tipo: tipo as EmpleadoDocumentoTipo,
          nombre,
          archivoUrl: `/uploads/empleados/${empleadoId}/${file.filename}`,
          mimeType: file.mimetype,
          tamano: file.size,
        });

        return res.status(201).json({
          success: true,
          data: documento.toJSON(),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Error al subir documento';
        const status = message.includes('no encontrado') ? 404 : 500;
        console.error('[empleados/documentos/upload]', error);
        return res.status(status).json({
          success: false,
          error: { code: status === 404 ? 'NOT_FOUND' : 'INTERNAL_ERROR', message },
        });
      }
    },

    async removeDocumento(req, res) {
      try {
        await empleadoService.deleteDocumento(paramId(req), String(req.params.docId));
        return res.status(200).json({
          success: true,
          data: { id: String(req.params.docId) },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Error al eliminar documento';
        const status = message.includes('no encontrado') ? 404 : 500;
        console.error('[empleados/documentos/remove]', error);
        return res.status(status).json({
          success: false,
          error: { code: status === 404 ? 'NOT_FOUND' : 'INTERNAL_ERROR', message },
        });
      }
    },
  };
}
