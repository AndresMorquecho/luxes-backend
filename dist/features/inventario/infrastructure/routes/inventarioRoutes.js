import { Router } from 'express';
import { authMiddleware } from '../../../auth/infrastructure/middleware/authMiddleware.js';
export function createInventarioRoutes(ctrl) {
    const router = Router();
    // Todos los endpoints de inventario requieren autenticación
    router.use(authMiddleware);
    // ── Materiales ────────────────────────────────────────────────────────────
    // GET  /api/inventario/unidades-medida
    router.get('/unidades-medida', (req, res) => ctrl.listUnidadesMedida(req, res));
    // GET  /api/inventario/stats
    router.get('/stats', (req, res) => ctrl.getStats(req, res));
    // GET  /api/inventario?tipo=consumible|herramienta
    router.get('/', (req, res) => ctrl.listMateriales(req, res));
    // POST /api/inventario
    router.post('/', (req, res) => ctrl.createMaterial(req, res));
    // PUT  /api/inventario/:id
    router.put('/:id', (req, res) => ctrl.updateMaterial(req, res));
    // DELETE /api/inventario/:id
    router.delete('/:id', (req, res) => ctrl.deleteMaterial(req, res));
    // ── Movimientos ──────────────────────────────────────────────────────────
    // GET  /api/inventario/movimientos?materialId=xxx
    router.get('/movimientos', (req, res) => ctrl.listMovimientos(req, res));
    // POST /api/inventario/:id/movimiento  (entrada o salida)
    router.post('/:id/movimiento', (req, res) => ctrl.createMovimiento(req, res));
    // ── Préstamos ─────────────────────────────────────────────────────────────
    // GET  /api/inventario/prestamos?estado=prestado|devuelto
    router.get('/prestamos', (req, res) => ctrl.listPrestamos(req, res));
    // POST /api/inventario/prestamos
    router.post('/prestamos', (req, res) => ctrl.createPrestamo(req, res));
    // PUT  /api/inventario/prestamos/:id/retorno
    router.put('/prestamos/:id/retorno', (req, res) => ctrl.returnPrestamo(req, res));
    return router;
}
