import { GastosController } from '../adapters/http/gastosController.js';
import { VehiculosController } from '../adapters/http/vehiculosController.js';
import { createGastosRoutes } from '../routes/gastosRoutes.js';
export async function createGastosModule() {
    const gastosController = new GastosController();
    const vehiculosController = new VehiculosController();
    const { gastosRouter, vehiculosRouter } = createGastosRoutes(gastosController, vehiculosController);
    return { gastosRouter, vehiculosRouter };
}
