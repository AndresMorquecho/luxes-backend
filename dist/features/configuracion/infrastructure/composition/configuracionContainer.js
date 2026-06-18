import { ConfiguracionController } from '../adapters/http/configuracionController.js';
import { createConfiguracionRoutes } from '../routes/configuracionRoutes.js';
export async function createConfiguracionModule() {
    const controller = new ConfiguracionController();
    const configuracionRoutes = createConfiguracionRoutes(controller);
    return { configuracionRoutes };
}
