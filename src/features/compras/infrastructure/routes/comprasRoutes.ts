import { Router } from 'express';
import type { ComprasController } from '../adapters/http/comprasController.js';
import { authMiddleware } from '../../../auth/infrastructure/middleware/authMiddleware.js';
import { requirePermissions } from '../../../auth/infrastructure/middleware/roleMiddleware.js';

export function createComprasRoutes(ctrl: ComprasController): Router {
  const router = Router();

  // Todos los endpoints de compras requieren autenticación
  router.use(authMiddleware);

  // ── Stats (antes de :id para evitar conflicto) ─────────────────────────────
  router.get('/stats',                     (req, res) => ctrl.getStats(req, res));

  // ── Proveedores ────────────────────────────────────────────────────────────
  router.get('/proveedores',               (req, res) => ctrl.listProveedores(req, res));
  router.post('/proveedores',              (req, res) => ctrl.createProveedor(req, res));
  router.put('/proveedores/:id',           (req, res) => ctrl.updateProveedor(req, res));
  router.delete('/proveedores/:id',        (req, res) => ctrl.deleteProveedor(req, res));

  // ── Cuentas por Pagar ──────────────────────────────────────────────────────
  router.get('/cuentas-por-pagar',         (req, res) => ctrl.listCuentasPorPagar(req, res));

  // ── Métodos de Pago ────────────────────────────────────────────────────────
  router.get('/metodos-pago',              (req, res) => ctrl.listMetodosPago(req, res));
  router.post('/metodos-pago',             (req, res) => ctrl.createMetodoPago(req, res));
  router.put('/metodos-pago/:id',          (req, res) => ctrl.updateMetodoPago(req, res));
  router.delete('/metodos-pago/:id',       (req, res) => ctrl.deleteMetodoPago(req, res));

  // ── Órdenes de Compra ──────────────────────────────────────────────────────
  router.get('/',                          (req, res) => ctrl.listOrdenes(req, res));
  router.post('/',                         (req, res) => ctrl.createOrden(req, res));
  router.get('/:id',                       (req, res) => ctrl.getOrdenById(req, res));
  router.put('/:id',                       requirePermissions(['aprobacion_ordenes_compra']), (req, res) => ctrl.updateOrden(req, res));
  router.delete('/:id',                    (req, res) => ctrl.deleteOrden(req, res));

  // ── Abonos por Orden ───────────────────────────────────────────────────────
  router.get('/:id/abonos',               (req, res) => ctrl.listAbonos(req, res));
  router.post('/:id/abono',               (req, res) => ctrl.createAbono(req, res));

  // ── Recepción de Orden ──────────────────────────────────────────────────────
  router.post('/:id/recepcion',           (req, res) => ctrl.recepcionarOrden(req, res));

  return router;
}
