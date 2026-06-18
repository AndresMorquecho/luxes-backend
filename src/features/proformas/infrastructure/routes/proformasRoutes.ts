import { Router } from 'express';
import type { ProformasController } from '../adapters/http/proformasController.js';
import { authMiddleware } from '../../../auth/infrastructure/middleware/authMiddleware.js';

export function createProformasRoutes(controller: ProformasController): Router {
  const router = Router();

  router.get('/', authMiddleware, (req, res) => controller.list(req, res));
  router.post('/', authMiddleware, (req, res) => controller.create(req, res));
  router.put('/:id', authMiddleware, (req, res) => controller.update(req, res));
  router.patch('/:id/estado', authMiddleware, (req, res) => controller.updateEstado(req, res));
  router.delete('/:id', authMiddleware, (req, res) => controller.remove(req, res));

  return router;
}
