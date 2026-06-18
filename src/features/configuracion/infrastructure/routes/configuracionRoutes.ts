import { Router } from 'express';
import type { ConfiguracionController } from '../adapters/http/configuracionController.js';
import { authMiddleware } from '../../../auth/infrastructure/middleware/authMiddleware.js';

export function createConfiguracionRoutes(controller: ConfiguracionController): Router {
  const router = Router();

  router.get('/', authMiddleware, (req, res) => controller.get(req, res));
  router.put('/', authMiddleware, (req, res) => controller.update(req, res));

  return router;
}
