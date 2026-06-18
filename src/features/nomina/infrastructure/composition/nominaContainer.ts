import { NominaController } from '../adapters/http/nominaController.js';
import { createNominaRoutes } from '../routes/nominaRoutes.js';

export async function createNominaModule() {
  const nominaController = new NominaController();
  const nominaRoutes = createNominaRoutes(nominaController);

  return { nominaRoutes, nominaController };
}
