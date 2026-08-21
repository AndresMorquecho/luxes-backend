import { Router } from 'express';
import { authMiddleware } from '../../../auth/infrastructure/middleware/authMiddleware.js';
import { requireRoles } from '../../../auth/infrastructure/middleware/roleMiddleware.js';
export function createTareasRoutes(ctrl) {
    const router = Router();
    // All tareas endpoints require authentication
    router.use(authMiddleware);
    // ── Stats (before :id to avoid conflict) ─────────────────────────────────
    router.get('/stats', (req, res) => ctrl.getStats(req, res));
    // ── My tasks (any authenticated user) ────────────────────────────────────
    router.get('/mis-tareas', (req, res) => ctrl.getMyTareas(req, res));
    // ── All tasks (Admin only) ───────────────────────────────────────────────
    router.get('/', requireRoles(['admin', 'administrador', 'Admin', 'Administrador']), (req, res) => ctrl.listTareas(req, res));
    // ── Create task (Admin only) ─────────────────────────────────────────────
    router.post('/', requireRoles(['admin', 'administrador', 'Admin', 'Administrador']), (req, res) => ctrl.createTarea(req, res));
    // ── Get task by ID (any authenticated user) ──────────────────────────────
    router.get('/:id', (req, res) => ctrl.getTareaById(req, res));
    // ── Update task (any authenticated user can update status of their tasks) ─
    router.put('/:id', (req, res) => ctrl.updateTarea(req, res));
    // ── Delete task (Admin only) ─────────────────────────────────────────────
    router.delete('/:id', requireRoles(['admin', 'administrador', 'Admin', 'Administrador']), (req, res) => ctrl.deleteTarea(req, res));
    return router;
}
