import { ClientesService } from '../../application/services/ClientesService.js';
import { createClientesController } from '../adapters/http/clientesController.js';
import { createClientesRoutes } from '../routes/clientesRoutes.js';

export async function createClientesModule() {
  const clientesService = new ClientesService();
  const clientesController = createClientesController(clientesService);
  const clientesRoutes = createClientesRoutes(clientesController);

  return { clientesRoutes, clientesService };
}
