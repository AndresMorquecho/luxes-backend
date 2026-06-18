import { Router } from 'express';
import { authMiddleware } from '../../../auth/infrastructure/middleware/authMiddleware.js';
export function createConfiguracionRoutes(controller) {
    const router = Router();
    router.get('/', authMiddleware, (req, res) => controller.get(req, res));
    router.put('/', authMiddleware, (req, res) => controller.update(req, res));
    return router;
}
