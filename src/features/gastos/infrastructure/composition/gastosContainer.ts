import { GastosService } from '../../application/services/GastosService.js';
import { createGastosController } from '../adapters/http/gastosController.js';
import { createGastosRoutes } from '../routes/gastosRoutes.js';

export async function createGastosModule() {
  const gastosService = new GastosService();
  const gastosController = createGastosController(gastosService);
  const gastosRoutes = createGastosRoutes(gastosController);

  return { gastosRoutes, gastosService };
}
