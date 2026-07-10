import { Router } from 'express';
import { AsistenciaController } from '../adapters/http/asistenciaController.js';
import { authMiddleware } from '../../../auth/infrastructure/middleware/authMiddleware.js';
import { requireRoles } from '../../../auth/infrastructure/middleware/roleMiddleware.js';

export function createAsistenciaRoutes(controller: AsistenciaController): Router {
  const router = Router();

  router.get('/horario', authMiddleware, (req, res) => controller.getHorarioDelDia(req, res));
  router.get('/horario-config', authMiddleware, requireRoles(['admin', 'Administrador']), (req, res) =>
    controller.getHorarioConfig(req, res),
  );
  router.put('/horario-config', authMiddleware, requireRoles(['admin', 'Administrador']), (req, res) =>
    controller.saveHorarioConfig(req, res),
  );

  router.get('/', authMiddleware, (req, res) => controller.list(req, res));
  router.get('/empleado/:empleadoId/proxima', authMiddleware, (req, res) =>
    controller.getProxima(req, res)
  );
  router.get('/empleado/:empleadoId/hoy', authMiddleware, (req, res) =>
    controller.getTodayForEmpleado(req, res)
  );
  router.post('/registrar', authMiddleware, (req, res) => controller.registrar(req, res));
  router.post('/permiso', authMiddleware, (req, res) => controller.registrarPermiso(req, res));
  router.delete('/permiso', authMiddleware, (req, res) => controller.eliminarPermiso(req, res));

  return router;
}

