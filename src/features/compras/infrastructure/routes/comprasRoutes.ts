import { Router } from 'express';
import type { ComprasController } from '../adapters/http/comprasController.js';
import { authMiddleware } from '../../../auth/infrastructure/middleware/authMiddleware.js';

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
  router.post('/cuentas-por-pagar/manual',  (req, res) => ctrl.createCuentaPorPagarManual(req, res));

  // ── Métodos de Pago ────────────────────────────────────────────────────────
  router.get('/metodos-pago',              (req, res) => ctrl.listMetodosPago(req, res));
  router.post('/metodos-pago',             (req, res) => ctrl.createMetodoPago(req, res));
  router.put('/metodos-pago/:id',          (req, res) => ctrl.updateMetodoPago(req, res));
  router.delete('/metodos-pago/:id',       (req, res) => ctrl.deleteMetodoPago(req, res));

  // ── Cheques Posfechados (antes de :id) ────────────────────────────────────
  router.get('/cheques',                   (req, res) => ctrl.listCheques(req, res));
  router.post('/cheques/:id/procesar',     (req, res) => ctrl.procesarCheque(req, res));
  router.put('/cheques/:id',              (req, res) => ctrl.updateCheque(req, res));
  router.delete('/cheques/:id',           (req, res) => ctrl.deleteCheque(req, res));

  // ── Órdenes de Compra ──────────────────────────────────────────────────────
  router.get('/',                          (req, res) => ctrl.listOrdenes(req, res));
  router.post('/',                         (req, res) => ctrl.createOrden(req, res));
  router.get('/:id/detalles',              (req, res) => ctrl.getOrdenDetalles(req, res));
  router.post('/:id/restaurar-detalles',  (req, res) => ctrl.restoreOrdenDetalles(req, res));
  router.get('/:id',                       (req, res) => ctrl.getOrdenById(req, res));
  router.put('/:id/editar',                (req, res) => ctrl.editarOrden(req, res));
  router.put('/:id',                       (req, res) => ctrl.updateOrden(req, res));
  router.delete('/:id',                    (req, res) => ctrl.deleteOrden(req, res));

  // ── Abonos por Orden ───────────────────────────────────────────────────────
  router.get('/:id/abonos',               (req, res) => ctrl.listAbonos(req, res));
  router.post('/:id/abono',               (req, res) => ctrl.createAbono(req, res));
  router.delete('/:id/abonos/:abonoId',   (req, res) => ctrl.eliminarAbono(req, res));

  return router;
}
