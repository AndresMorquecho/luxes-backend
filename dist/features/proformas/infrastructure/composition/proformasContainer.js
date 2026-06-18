import { ProformasController } from '../adapters/http/proformasController.js';
import { createProformasRoutes } from '../routes/proformasRoutes.js';
export async function createProformasModule() {
    const controller = new ProformasController();
    const proformasRoutes = createProformasRoutes(controller);
    return { proformasRoutes };
}
