import { ImpresionesController } from '../adapters/http/impresionesController.js';
import { createImpresionesRoutes } from '../routes/impresionesRoutes.js';
export async function createImpresionesModule() {
    const controller = new ImpresionesController();
    const impresionesRoutes = createImpresionesRoutes(controller);
    return { impresionesRoutes };
}
