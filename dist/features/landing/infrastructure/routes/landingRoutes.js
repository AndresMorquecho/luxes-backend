import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { authMiddleware } from '../../../auth/infrastructure/middleware/authMiddleware.js';
import { requireRoles } from '../../../auth/infrastructure/middleware/roleMiddleware.js';
import { ensureUploadsDir, LandingController, UPLOADS_DIR, } from '../adapters/http/landingController.js';
const landingController = new LandingController();
const storage = multer.diskStorage({
    destination: async (_req, _file, cb) => {
        try {
            await ensureUploadsDir();
            cb(null, UPLOADS_DIR);
        }
        catch (error) {
            cb(error, UPLOADS_DIR);
        }
    },
    filename: (req, file, cb) => {
        const section = String(req.body?.section ?? 'misc');
        const itemId = String(req.body?.itemId ?? 'image').replace(/[^a-zA-Z0-9-_]/g, '');
        const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
        const timestamp = Date.now();
        cb(null, `${section}-${itemId}-${timestamp}${ext}`);
    },
});
const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
            cb(new Error('Solo se permiten archivos de imagen'));
            return;
        }
        cb(null, true);
    },
});
export function createLandingRoutes() {
    const router = Router();
    router.get('/', (req, res) => landingController.getConfig(req, res));
    router.post('/images', authMiddleware, requireRoles(['admin', 'Administrador']), (req, res, next) => {
        upload.single('image')(req, res, (error) => {
            if (error) {
                return res.status(400).json({
                    success: false,
                    error: {
                        code: 'UPLOAD_ERROR',
                        message: error instanceof Error ? error.message : 'Error al subir la imagen',
                    },
                });
            }
            return next();
        });
    }, (req, res) => landingController.uploadImage(req, res));
    router.delete('/images/:section/:itemId', authMiddleware, requireRoles(['admin', 'Administrador']), (req, res) => landingController.resetImage(req, res));
    return router;
}
