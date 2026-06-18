import { Router } from 'express';
import { ImpresionesController } from '../adapters/http/impresionesController.js';
import { authMiddleware } from '../../../auth/infrastructure/middleware/authMiddleware.js';

export function createImpresionesRoutes(controller: ImpresionesController): Router {
  const router = Router();

  router.use(authMiddleware);

  router.get('/', (req, res) => controller.list(req, res));
  router.post('/', (req, res) => controller.create(req, res));
  router.put('/:id', (req, res) => controller.update(req, res));
  router.delete('/:id', (req, res) => controller.remove(req, res));
  router.post('/reorder', (req, res) => controller.reorder(req, res));

  return router;
}
