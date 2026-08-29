import { Router } from 'express';
import { authMiddleware } from '../../../auth/infrastructure/middleware/authMiddleware.js';
import type { CalendarioController } from '../adapters/http/calendarioController.js';
import type { RutinasController } from '../adapters/http/rutinasController.js';

export function createCalendarioRoutes(
  calCtrl: CalendarioController,
  rutinasCtrl: RutinasController
): { calendarioRouter: Router; rutinasRouter: Router } {
  const calRouter = Router();
  calRouter.use(authMiddleware);
  calRouter.get('/eventos', (req, res) => calCtrl.getEventos(req, res));

  const rutRouter = Router();
  rutRouter.use(authMiddleware);
  rutRouter.get('/', (req, res) => rutinasCtrl.list(req, res));
  rutRouter.post('/', (req, res) => rutinasCtrl.create(req, res));
  rutRouter.get('/:id', (req, res) => rutinasCtrl.getById(req, res));
  rutRouter.put('/:id', (req, res) => rutinasCtrl.update(req, res));
  rutRouter.delete('/:id', (req, res) => rutinasCtrl.delete(req, res));
  rutRouter.post('/:id/toggle', (req, res) => rutinasCtrl.toggleCompletada(req, res));

  return { calendarioRouter: calRouter, rutinasRouter: rutRouter };
}
