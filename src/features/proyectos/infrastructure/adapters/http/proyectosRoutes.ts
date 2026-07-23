import { Router, type Request } from 'express';
import multer from 'multer';
import path from 'path';
import { ProyectosController } from './proyectosController.js';
import { authMiddleware } from '../../../../auth/infrastructure/middleware/authMiddleware.js';
import { ensureProyectoUploadsDir } from './proyectosController.js';

const PROYECTOS_UPLOADS_ROOT = path.resolve('uploads/proyectos');

function proyectoDestination(
  req: Request,
  _file: Express.Multer.File,
  cb: (error: Error | null, destination: string) => void,
) {
  const proyectoId = String(req.params.id);
  ensureProyectoUploadsDir(proyectoId)
    .then(() => cb(null, path.join(PROYECTOS_UPLOADS_ROOT, proyectoId)))
    .catch((error) => cb(error as Error, PROYECTOS_UPLOADS_ROOT));
}

const storageDiseno = multer.diskStorage({
  destination: proyectoDestination,
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `diseno-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

const storageEvidencia = multer.diskStorage({
  destination: proyectoDestination,
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `evidencia-${uniqueSuffix}${ext}`);
  },
});

const uploadDiseno = multer({
  storage: storageDiseno,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = /pdf|ai|psd|jpg|jpeg|png|webp|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de archivo no permitido'));
    }
  },
});

const uploadEvidencia = multer({
  storage: storageEvidencia,
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /jpg|jpeg|png|webp|gif/;
    const extname = allowed.test(path.extname(file.originalname).toLowerCase());
    const mimetype = file.mimetype.startsWith('image/');
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten imágenes JPG, PNG, WEBP o GIF'));
    }
  },
});

const router = Router();
const controller = new ProyectosController();

// Archivos de proyecto: ruta pública (nombres aleatorios) — sirve vía /api para el proxy nginx
router.get('/:id/archivos/:filename', (req, res) => controller.serveArchivoProyecto(req, res));

router.use(authMiddleware);

router.get('/', (req, res) => controller.list(req, res));
router.get('/reportes/stats', (req, res) => controller.getProjectStats(req, res));
router.post('/sincronizar-devoluciones', (req, res) => controller.sincronizarDevoluciones(req, res));
router.get('/:id', (req, res) => controller.getById(req, res));
router.post('/', (req, res) => controller.create(req, res));
router.put('/:id', (req, res) => controller.update(req, res));
router.delete('/:id', (req, res) => controller.remove(req, res));
router.post('/:id/avanzar-fase', (req, res) => controller.avanzarFase(req, res));
router.put('/:id/instalacion', (req, res) => controller.updateInstalacion(req, res));

router.post(
  '/:id/upload-diseno',
  (req, res, next) => {
    uploadDiseno.single('archivo')(req, res, (error) => {
      if (error) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'UPLOAD_ERROR',
            message: error instanceof Error ? error.message : 'Error al subir el archivo',
          },
        });
      }
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: { code: 'NO_FILE', message: 'No se proporcionó archivo' },
        });
      }
      next();
    });
  },
  (req, res) => controller.uploadArchivoDiseno(req, res),
);

router.post(
  '/:id/upload-evidencia',
  (req, res, next) => {
    uploadEvidencia.single('archivo')(req, res, (error) => {
      if (error) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'UPLOAD_ERROR',
            message: error instanceof Error ? error.message : 'Error al subir la evidencia',
          },
        });
      }
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: { code: 'NO_FILE', message: 'No se proporcionó imagen' },
        });
      }
      next();
    });
  },
  (req, res) => controller.uploadEvidenciaInstalacion(req, res),
);

export default router;
