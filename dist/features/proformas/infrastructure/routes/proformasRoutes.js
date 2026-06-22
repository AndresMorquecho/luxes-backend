import { Router } from 'express';
import { authMiddleware } from '../../../auth/infrastructure/middleware/authMiddleware.js';
export function createProformasRoutes(controller) {
    const router = Router();
    router.get('/', authMiddleware, (req, res) => controller.list(req, res));
    router.post('/', authMiddleware, (req, res) => controller.create(req, res));
    router.get('/:id', authMiddleware, (req, res) => controller.getById(req, res));
    router.put('/:id', authMiddleware, (req, res) => controller.update(req, res));
    router.patch('/:id/estado', authMiddleware, (req, res) => controller.updateEstado(req, res));
    router.post('/:id/aprobar', authMiddleware, (req, res) => controller.aprobar(req, res));
    router.post('/:id/rechazar', authMiddleware, (req, res) => controller.rechazar(req, res));
    router.post('/:id/abonos', authMiddleware, (req, res) => controller.registrarAbono(req, res));
    router.delete('/:id', authMiddleware, (req, res) => controller.remove(req, res));
    return router;
}
