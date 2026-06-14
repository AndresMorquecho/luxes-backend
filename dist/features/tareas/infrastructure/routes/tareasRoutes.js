import { Router } from 'express';
import { authMiddleware } from '../../../auth/infrastructure/middleware/authMiddleware.js';
import { requirePermissions } from '../../../auth/infrastructure/middleware/roleMiddleware.js';
export function createTareasRoutes(ctrl) {
    const router = Router();
    // All tareas endpoints require authentication
    router.use(authMiddleware);
    // ── Stats (before :id to avoid conflict) ─────────────────────────────────
    router.get('/stats', (req, res) => ctrl.getStats(req, res));
    // ── My tasks (any authenticated user) ────────────────────────────────────
    router.get('/mis-tareas', (req, res) => ctrl.getMyTareas(req, res));
    // ── All tasks (requires gestion_tareas permission) ───────────────────────
    router.get('/', requirePermissions(['gestion_tareas']), (req, res) => ctrl.listTareas(req, res));
    // ── Create task (requires gestion_tareas permission) ─────────────────────
    router.post('/', requirePermissions(['gestion_tareas']), (req, res) => ctrl.createTarea(req, res));
    // ── Get task by ID (any authenticated user) ──────────────────────────────
    router.get('/:id', (req, res) => ctrl.getTareaById(req, res));
    // ── Update task (any authenticated user can update status of their tasks) ─
    router.put('/:id', (req, res) => ctrl.updateTarea(req, res));
    // ── Delete task (requires gestion_tareas permission) ─────────────────────
    router.delete('/:id', requirePermissions(['gestion_tareas']), (req, res) => ctrl.deleteTarea(req, res));
    return router;
}
