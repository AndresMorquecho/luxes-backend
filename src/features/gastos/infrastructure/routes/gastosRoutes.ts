import { Router } from 'express';
import type { GastosController } from '../adapters/http/gastosController.js';
import type { VehiculosController } from '../adapters/http/vehiculosController.js';
import { authMiddleware } from '../../../auth/infrastructure/middleware/authMiddleware.js';

export function createGastosRoutes(
  gastosController: GastosController,
  vehiculosController: VehiculosController
): { gastosRouter: Router; vehiculosRouter: Router } {
  const gastosRouter = Router();
  const vehiculosRouter = Router();

  // Gastos
  gastosRouter.get('/', authMiddleware, (req, res) => gastosController.list(req, res));
  gastosRouter.post('/', authMiddleware, (req, res) => gastosController.create(req, res));
  gastosRouter.put('/:id', authMiddleware, (req, res) => gastosController.update(req, res));
  gastosRouter.delete('/:id', authMiddleware, (req, res) => gastosController.remove(req, res));

  // Movimientos financieros (vista unificada)
  gastosRouter.get('/movimientos', authMiddleware, (req, res) => gastosController.listMovimientos(req, res));

  // Cierre de caja
  gastosRouter.get('/cierre/preview', authMiddleware, (req, res) => gastosController.previewCierre(req, res));
  gastosRouter.post('/cierre', authMiddleware, (req, res) => gastosController.saveCierre(req, res));
  gastosRouter.get('/cierre', authMiddleware, (req, res) => gastosController.listCierres(req, res));

  // Reportes
  gastosRouter.get('/reportes/dashboard-summary', authMiddleware, (req, res) => gastosController.getDashboardSummary(req, res));

  // Vehículos
  vehiculosRouter.get('/', authMiddleware, (req, res) => vehiculosController.listVehiculos(req, res));
  vehiculosRouter.post('/', authMiddleware, (req, res) => vehiculosController.createVehiculo(req, res));
  vehiculosRouter.put('/:id', authMiddleware, (req, res) => vehiculosController.updateVehiculo(req, res));
  vehiculosRouter.delete('/:id', authMiddleware, (req, res) => vehiculosController.removeVehiculo(req, res));
  vehiculosRouter.get('/:id', authMiddleware, (req, res) => vehiculosController.getVehiculo(req, res));

  // Mantenimientos
  vehiculosRouter.post('/:id/mantenimientos', authMiddleware, (req, res) => vehiculosController.createMantenimiento(req, res));
  vehiculosRouter.put('/mantenimientos/:mantenimientoId', authMiddleware, (req, res) => vehiculosController.updateMantenimiento(req, res));
  vehiculosRouter.delete('/mantenimientos/:mantenimientoId', authMiddleware, (req, res) => vehiculosController.removeMantenimiento(req, res));

  return { gastosRouter, vehiculosRouter };
}
