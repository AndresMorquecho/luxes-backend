import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { ProyectosController } from './proyectosController.js';
import { authMiddleware } from '../../../../auth/infrastructure/middleware/authMiddleware.js';
import { ensureProyectoUploadsDir } from './proyectosController.js';
const PROYECTOS_UPLOADS_ROOT = path.resolve('uploads/proyectos');
const storage = multer.diskStorage({
    destination: async (req, _file, cb) => {
        try {
            const proyectoId = String(req.params.id);
            await ensureProyectoUploadsDir(proyectoId);
            cb(null, path.join(PROYECTOS_UPLOADS_ROOT, proyectoId));
        }
        catch (error) {
            cb(error, PROYECTOS_UPLOADS_ROOT);
        }
    },
    filename: (_req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, `diseno-${uniqueSuffix}${path.extname(file.originalname)}`);
    },
});
const upload = multer({
    storage,
    fileFilter: (_req, file, cb) => {
        const allowedTypes = /pdf|ai|psd|jpg|jpeg|png/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (extname && mimetype) {
            return cb(null, true);
        }
        else {
            cb(new Error('Solo se permiten archivos PDF, AI, PSD, JPG, PNG'));
        }
    },
});
const router = Router();
const controller = new ProyectosController();
router.use(authMiddleware);
router.get('/', (req, res) => controller.list(req, res));
router.get('/:id', (req, res) => controller.getById(req, res));
router.post('/', (req, res) => controller.create(req, res));
router.put('/:id', (req, res) => controller.update(req, res));
router.delete('/:id', (req, res) => controller.remove(req, res));
router.post('/:id/avanzar-fase', (req, res) => controller.avanzarFase(req, res));
router.put('/:id/instalacion', (req, res) => controller.updateInstalacion(req, res));
// Endpoint para subir archivo de diseño
router.post('/:id/upload-diseno', authMiddleware, (req, res, next) => {
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
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: { code: 'NO_FILE', message: 'No se proporcionó archivo' },
            });
        }
        next();
    });
}, (req, res) => controller.uploadArchivoDiseno(req, res));
export default router;
