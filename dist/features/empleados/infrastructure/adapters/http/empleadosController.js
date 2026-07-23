import { isValidDocumentoTipo } from '../persistence/prismaEmpleadoDocumentoAdapter.js';
import { prisma } from '../../../../../config/prismaClient.js';
const parseBody = (body) => ({
    nombre: String(body.nombre ?? ''),
    cedula: String(body.cedula ?? ''),
    telefono: String(body.telefono ?? ''),
    correo: String(body.correo ?? ''),
    username: body.username ? String(body.username) : undefined,
    contraseña: body.contraseña ? String(body.contraseña) : undefined,
    cuentaBanco: String(body.cuentaBanco ?? ''),
    banco: String(body.banco ?? ''),
    tipoContrato: String(body.tipoContrato ?? 'Fijo'),
    tieneContrato: body.tieneContrato !== undefined ? Boolean(body.tieneContrato) : undefined,
    region: body.region ? String(body.region) : undefined,
    decimoTerceroMensualizado: body.decimoTerceroMensualizado !== undefined ? Boolean(body.decimoTerceroMensualizado) : undefined,
    decimoCuartoMensualizado: body.decimoCuartoMensualizado !== undefined ? Boolean(body.decimoCuartoMensualizado) : undefined,
    sueldoDiario: Number(body.sueldoDiario) || 0,
    decimoTerceroValor: body.decimoTerceroValor !== undefined && body.decimoTerceroValor !== null && body.decimoTerceroValor !== '' ? Number(body.decimoTerceroValor) : null,
    decimoCuartoValor: body.decimoCuartoValor !== undefined && body.decimoCuartoValor !== null && body.decimoCuartoValor !== '' ? Number(body.decimoCuartoValor) : null,
    iessValor: body.iessValor !== undefined && body.iessValor !== null && body.iessValor !== '' ? Number(body.iessValor) : null,
    direccion: String(body.direccion ?? ''),
    foto: body.foto ? String(body.foto) : null,
    rol: body.rol ? String(body.rol) : undefined,
    roleId: body.roleId ? String(body.roleId) : undefined,
});
const paramId = (req) => String(req.params.id);
export function createEmpleadosController(empleadoService) {
    return {
        async list(_req, res) {
            try {
                const empleados = await empleadoService.listEmpleados();
                return res.status(200).json({
                    success: true,
                    data: empleados.map((e) => e.toJSON()),
                });
            }
            catch (error) {
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
                const user = await prisma.user.findUnique({ where: { empleadoId: paramId(req) } });
                return res.status(200).json({
                    success: true,
                    data: {
                        ...empleado.toJSON(),
                        username: user?.username || '',
                        rol: user?.rol || '',
                        roleId: user?.roleId || '',
                        documentos: (await empleadoService.listDocumentos(paramId(req))).map((d) => d.toJSON()),
                    },
                });
            }
            catch (error) {
                console.error('[empleados/getById]', error);
                return res.status(500).json({
                    success: false,
                    error: { code: 'INTERNAL_ERROR', message: 'Error al obtener empleado' },
                });
            }
        },
        async create(req, res) {
            try {
                const body = parseBody(req.body ?? {});
                const empleado = await empleadoService.createEmpleado(body);
                let message = undefined;
                if (body.correo) {
                    const username = body.username?.trim() || body.correo.trim().split('@')[0] || `user_${body.cedula.trim()}`;
                    message = `Se ha generado un usuario de manera automática con el nombre de usuario '${username}', correo '${body.correo.trim().toLowerCase()}' y contraseña '123456'.`;
                }
                return res.status(201).json({
                    success: true,
                    data: empleado.toJSON(),
                    message,
                });
            }
            catch (error) {
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
            }
            catch (error) {
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
            }
            catch (error) {
                const prismaCode = error && typeof error === 'object' && 'code' in error
                    ? String(error.code)
                    : '';
                const isFkError = prismaCode === 'P2003' || prismaCode === 'P2014';
                const message = isFkError
                    ? 'No se puede eliminar este colaborador porque tiene registros vinculados (órdenes de compra, tareas u otros). El usuario del portal se desactivará automáticamente al eliminar.'
                    : error instanceof Error
                        ? error.message
                        : 'Error al eliminar empleado';
                const status = message.includes('no encontrado')
                    ? 404
                    : isFkError
                        ? 409
                        : 500;
                console.error('[empleados/remove]', error);
                return res.status(status).json({
                    success: false,
                    error: {
                        code: status === 404 ? 'NOT_FOUND' : status === 409 ? 'CONFLICT' : 'INTERNAL_ERROR',
                        message,
                    },
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
            }
            catch (error) {
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
                    tipo: tipo,
                    nombre,
                    archivoUrl: `/uploads/empleados/${empleadoId}/${file.filename}`,
                    mimeType: file.mimetype,
                    tamano: file.size,
                });
                return res.status(201).json({
                    success: true,
                    data: documento.toJSON(),
                });
            }
            catch (error) {
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
            }
            catch (error) {
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
