import { Router } from 'express';
import { NominaController } from '../adapters/http/nominaController.js';
import { authMiddleware } from '../../../auth/infrastructure/middleware/authMiddleware.js';

export function createNominaRoutes(controller: NominaController): Router {
  const router = Router();

  router.get('/horas-extras', authMiddleware, (req, res) => controller.getOvertime(req, res));
  router.get('/horas-extras/pendientes', authMiddleware, (req, res) => controller.getPendingOvertime(req, res));
  router.post('/horas-extras/:id/aprobar', authMiddleware, (req, res) => controller.approveOvertime(req, res));
  router.post('/horas-extras/:id/rechazar', authMiddleware, (req, res) => controller.rejectOvertime(req, res));
  router.patch('/horas-extras/:id', authMiddleware, (req, res) => controller.patchOvertime(req, res));
  router.post('/horas-extras', authMiddleware, (req, res) => controller.saveOvertimeBulk(req, res));
  router.get('/nominas', authMiddleware, (req, res) => controller.getPayrolls(req, res));
  router.post('/nominas', authMiddleware, (req, res) => controller.savePayroll(req, res));
  router.get('/periodo-config', authMiddleware, (req, res) => controller.getPeriodoConfig(req, res));
  router.put('/periodo-config', authMiddleware, (req, res) => controller.savePeriodoConfig(req, res));
  router.get('/config-global', authMiddleware, (req, res) => controller.getNominaGlobalConfig(req, res));
  router.put('/config-global', authMiddleware, (req, res) => controller.saveNominaGlobalConfig(req, res));
  router.get('/vacaciones', authMiddleware, (req, res) => controller.getVacaciones(req, res));
  router.post('/vacaciones', authMiddleware, (req, res) => controller.saveVacacion(req, res));
  router.get('/egresos', authMiddleware, (req, res) => controller.getDetailedEgresos(req, res));
  router.post('/egresos', authMiddleware, (req, res) => controller.createDetailedEgreso(req, res));
  router.delete('/egresos/:id', authMiddleware, (req, res) => controller.deleteDetailedEgreso(req, res));

  router.get('/ingresos', authMiddleware, (req, res) => controller.getDetailedIngresos(req, res));
  router.post('/ingresos', authMiddleware, (req, res) => controller.createDetailedIngreso(req, res));
  router.delete('/ingresos/:id', authMiddleware, (req, res) => controller.deleteDetailedIngreso(req, res));

  router.get('/exportar', authMiddleware, (req, res) => controller.exportToExcel(req, res));

  return router;
}
