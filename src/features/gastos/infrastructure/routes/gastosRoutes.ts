import { Router } from 'express';
import { authMiddleware } from '../../../auth/infrastructure/middleware/authMiddleware.js';
import { GastosController } from '../adapters/http/gastosController.js';

export function createGastosRoutes(controller: GastosController): Router {
  const router = Router();

  router.get('/', authMiddleware, (req, res) => controller.listGastos(req, res));
  router.post('/', authMiddleware, (req, res) => controller.saveGasto(req, res));
  router.put('/:id', authMiddleware, (req, res) => controller.saveGasto(req, res));
  router.delete('/:id', authMiddleware, (req, res) => controller.deleteGasto(req, res));

  router.get('/vehiculos', authMiddleware, (req, res) => controller.listVehiculos(req, res));
  router.post('/vehiculos', authMiddleware, (req, res) => controller.saveVehiculo(req, res));
  router.put('/vehiculos/:id', authMiddleware, (req, res) => controller.saveVehiculo(req, res));
  router.delete('/vehiculos/:id', authMiddleware, (req, res) => controller.deleteVehiculo(req, res));

  router.get('/vehiculos/:id/mantenimientos', authMiddleware, (req, res) =>
    controller.listMantenimientos(req, res)
  );
  router.post('/vehiculos/:id/mantenimientos', authMiddleware, (req, res) =>
    controller.saveMantenimiento(req, res)
  );
  router.put('/vehiculos/:id/mantenimientos/:mantId', authMiddleware, (req, res) =>
    controller.saveMantenimiento(req, res)
  );
  router.delete('/mantenimientos/:id', authMiddleware, (req, res) =>
    controller.deleteMantenimiento(req, res)
  );

  return router;
}
