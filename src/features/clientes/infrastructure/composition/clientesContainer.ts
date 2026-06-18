import { ClientesController } from '../adapters/http/clientesController.js';
import { createClientesRoutes } from '../routes/clientesRoutes.js';
import type { Router } from 'express';

export async function createClientesModule(): Promise<{ clientesRoutes: Router }> {
  const controller = new ClientesController();
  const clientesRoutes = createClientesRoutes(controller);
  return { clientesRoutes };
}
