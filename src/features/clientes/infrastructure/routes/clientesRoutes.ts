import { Router } from 'express';
import { authMiddleware } from '../../../auth/infrastructure/middleware/authMiddleware.js';
import { ClientesController } from '../adapters/http/clientesController.js';

export function createClientesRoutes(controller: ClientesController): Router {
  const router = Router();

  router.get('/', authMiddleware, (req, res) => controller.list(req, res));
  router.post('/', authMiddleware, (req, res) => controller.save(req, res));
  router.put('/:id', authMiddleware, (req, res) => controller.save(req, res));
  router.delete('/:id', authMiddleware, (req, res) => controller.remove(req, res));

  return router;
}
