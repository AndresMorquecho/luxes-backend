import { GuiaRemisionService } from '../../application/services/GuiaRemisionService.js';
import { GuiaRemisionController } from '../adapters/http/GuiaRemisionController.js';
import { createGuiaRemisionRoutes } from '../routes/guiaRemisionRoutes.js';
import type { Router } from 'express';

export async function createGuiaRemisionModule(): Promise<{ guiaRemisionRoutes: Router }> {
  const service = new GuiaRemisionService();
  const controller = new GuiaRemisionController(service);
  const guiaRemisionRoutes = createGuiaRemisionRoutes(controller);

  return { guiaRemisionRoutes };
}
