import { Router } from 'express';
import { authMiddleware } from '../../../auth/infrastructure/middleware/authMiddleware.js';
import { ProformasController } from '../adapters/http/proformasController.js';

export function createProformasRoutes(controller: ProformasController): Router {
  const router = Router();

  router.get('/proformas', authMiddleware, (req, res) => controller.listProformas(req, res));
  router.post('/proformas', authMiddleware, (req, res) => controller.saveProforma(req, res));
  router.put('/proformas/:id', authMiddleware, (req, res) => controller.saveProforma(req, res));
  router.patch('/proformas/:id/estado', authMiddleware, (req, res) =>
    controller.updateProformaEstado(req, res)
  );
  router.delete('/proformas/:id', authMiddleware, (req, res) => controller.deleteProforma(req, res));

  return router;
}
