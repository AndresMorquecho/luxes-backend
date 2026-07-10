import { Router } from 'express';
import type { GuiaRemisionController } from '../adapters/http/GuiaRemisionController.js';
import { authMiddleware } from '../../../auth/infrastructure/middleware/authMiddleware.js';

export function createGuiaRemisionRoutes(ctrl: GuiaRemisionController): Router {
  const router = Router();

  // Todos los endpoints de guías de remisión requieren autenticación
  router.use(authMiddleware);

  // Emitir guía de remisión
  router.post('/', (req, res) => ctrl.emitir(req, res));

  // Consultar estado de una guía de remisión por ID de comprobante
  router.get('/:id', (req, res) => ctrl.consultarEstado(req, res));

  return router;
}
