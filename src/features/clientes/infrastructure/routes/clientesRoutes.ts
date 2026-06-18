import { Router } from 'express';
import type { ClientesController } from '../adapters/http/clientesController.js';
import { authMiddleware } from '../../../auth/infrastructure/middleware/authMiddleware.js';

export function createClientesRoutes(controller: ClientesController): Router {
  const router = Router();

  router.get('/', authMiddleware, (req, res) => controller.list(req, res));
  router.post('/', authMiddleware, (req, res) => controller.create(req, res));
  router.put('/:id', authMiddleware, (req, res) => controller.update(req, res));
  router.delete('/:id', authMiddleware, (req, res) => controller.remove(req, res));

  return router;
}
