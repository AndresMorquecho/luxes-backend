import { ConfiguracionController } from '../adapters/http/configuracionController.js';
import { createConfiguracionRoutes } from '../routes/configuracionRoutes.js';
import type { Router } from 'express';

export async function createConfiguracionModule(): Promise<{ configuracionRoutes: Router }> {
  const controller = new ConfiguracionController();
  const configuracionRoutes = createConfiguracionRoutes(controller);
  return { configuracionRoutes };
}
