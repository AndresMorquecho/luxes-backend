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
        const section = String(req.body?.section ?? req.params?.id ?? 'cat');
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
const handleUploadError = (upload) => (req, res, next) => {
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
};
const adminMiddleware = [authMiddleware, requireRoles(['admin', 'Administrador'])];
export function createLandingRoutes() {
    const router = Router();
    // ── GET público consolidado ──────────────────────────────────────────────
    router.get('/', (req, res) => landingController.getConfig(req, res));
    // ── Imágenes hero/services/partners/catalog ──────────────────────────────
    router.post('/images', ...adminMiddleware, handleUploadError(upload), (req, res) => landingController.uploadImage(req, res));
    router.delete('/images/:section/:itemId', ...adminMiddleware, (req, res) => landingController.resetImage(req, res));
    // ── WhatsApp Config ──────────────────────────────────────────────────────
    router.get('/whatsapp', (req, res) => landingController.getWhatsapp(req, res));
    router.put('/whatsapp', ...adminMiddleware, (req, res) => landingController.updateWhatsapp(req, res));
    // ── Redes Sociales Config ────────────────────────────────────────────────
    router.get('/social', (req, res) => landingController.getSocial(req, res));
    router.put('/social', ...adminMiddleware, (req, res) => landingController.updateSocial(req, res));
    // ── CRUD Categorías ──────────────────────────────────────────────────────
    router.get('/categories', (req, res) => landingController.listCategories(req, res));
    router.post('/categories', ...adminMiddleware, (req, res) => landingController.createCategory(req, res));
    router.put('/categories/:id', ...adminMiddleware, (req, res) => landingController.updateCategory(req, res));
    router.delete('/categories/:id', ...adminMiddleware, (req, res) => landingController.deleteCategory(req, res));
    // ── Imágenes de Categoría ────────────────────────────────────────────────
    router.post('/categories/:id/images', ...adminMiddleware, handleUploadError(upload), (req, res) => landingController.addCategoryImage(req, res));
    router.patch('/categories/images/:imageId', ...adminMiddleware, (req, res) => landingController.updateCategoryImage(req, res));
    router.delete('/categories/images/:imageId', ...adminMiddleware, (req, res) => landingController.deleteCategoryImage(req, res));
    return router;
}
