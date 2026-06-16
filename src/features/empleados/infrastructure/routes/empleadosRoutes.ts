import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { authMiddleware } from '../../../auth/infrastructure/middleware/authMiddleware.js';
import { EmpleadosController } from '../adapters/http/empleadosController.js';
import {
  ensureEmpleadoUploadsDir,
  EMPLEADO_UPLOADS_ROOT,
  isValidDocumentoTipo,
} from '../adapters/persistence/prismaEmpleadoDocumentoAdapter.js';

const storage = multer.diskStorage({
  destination: async (req, _file, cb) => {
    try {
      const empleadoId = String(req.params.id);
      await ensureEmpleadoUploadsDir(empleadoId);
      cb(null, path.join(EMPLEADO_UPLOADS_ROOT, empleadoId));
    } catch (error) {
      cb(error as Error, EMPLEADO_UPLOADS_ROOT);
    }
  },
  filename: (_req, file, cb) => {
    const tipo = String(_req.body?.tipo ?? 'documento').replace(/[^a-zA-Z0-9-_]/g, '');
    const ext = path.extname(file.originalname).toLowerCase() || '.pdf';
    cb(null, `${tipo}-${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed =
      file.mimetype.startsWith('image/') ||
      file.mimetype === 'application/pdf' ||
      file.mimetype === 'application/msword' ||
      file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    if (!allowed) {
      cb(new Error('Solo se permiten imágenes, PDF o documentos Word'));
      return;
    }
    cb(null, true);
  },
});

export function createEmpleadosRoutes(controller: EmpleadosController): Router {
  const router = Router();

  router.get('/', authMiddleware, (req, res) => controller.list(req, res));
  router.get('/:id/documentos', authMiddleware, (req, res) => controller.listDocumentos(req, res));
  router.post(
    '/:id/documentos',
    authMiddleware,
    (req, res, next) => {
      upload.single('archivo')(req, res, (error) => {
        if (error) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'UPLOAD_ERROR',
              message: error instanceof Error ? error.message : 'Error al subir el archivo',
            },
          });
        }
        if (!isValidDocumentoTipo(String(req.body?.tipo ?? ''))) {
          return res.status(400).json({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'Tipo de documento inválido' },
          });
        }
        return next();
      });
    },
    (req, res) => controller.uploadDocumento(req, res)
  );
  router.delete('/:id/documentos/:docId', authMiddleware, (req, res) =>
    controller.removeDocumento(req, res)
  );
  router.get('/:id', authMiddleware, (req, res) => controller.getById(req, res));
  router.post('/', authMiddleware, (req, res) => controller.create(req, res));
  router.put('/:id', authMiddleware, (req, res) => controller.update(req, res));
  router.delete('/:id', authMiddleware, (req, res) => controller.remove(req, res));

  return router;
}
