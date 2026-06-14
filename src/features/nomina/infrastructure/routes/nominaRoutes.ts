import { Router } from 'express';
import { authMiddleware } from '../../../auth/infrastructure/middleware/authMiddleware.js';
import { NominaController } from '../adapters/http/nominaController.js';

export function createNominaRoutes(controller: NominaController): Router {
  const router = Router();

  router.get('/asistencias', authMiddleware, (req, res) => controller.listAsistencias(req, res));
  router.get('/asistencias/proxima-marcacion/:empleadoId', authMiddleware, (req, res) =>
    controller.getProximaMarcacion(req, res)
  );
  router.post('/asistencias', authMiddleware, (req, res) => controller.registrarAsistencia(req, res));

  router.get('/vacaciones', authMiddleware, (req, res) => controller.listVacaciones(req, res));
  router.put('/vacaciones', authMiddleware, (req, res) => controller.upsertVacacion(req, res));

  router.get('/horas-extras', authMiddleware, (req, res) => controller.listHorasExtras(req, res));
  router.post('/horas-extras/bulk', authMiddleware, (req, res) => controller.saveHorasExtrasBulk(req, res));

  router.get('/nominas', authMiddleware, (req, res) => controller.listNominas(req, res));
  router.post('/nominas', authMiddleware, (req, res) => controller.saveNomina(req, res));

  return router;
}
