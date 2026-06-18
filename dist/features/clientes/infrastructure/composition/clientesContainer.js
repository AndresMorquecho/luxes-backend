import { ClientesController } from '../adapters/http/clientesController.js';
import { createClientesRoutes } from '../routes/clientesRoutes.js';
export async function createClientesModule() {
    const controller = new ClientesController();
    const clientesRoutes = createClientesRoutes(controller);
    return { clientesRoutes };
}
