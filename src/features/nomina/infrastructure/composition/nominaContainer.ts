import { NominaService } from '../../application/services/NominaService.js';
import { createNominaController } from '../adapters/http/nominaController.js';
import { createNominaRoutes } from '../routes/nominaRoutes.js';

export async function createNominaModule() {
  const nominaService = new NominaService();
  const nominaController = createNominaController(nominaService);
  const nominaRoutes = createNominaRoutes(nominaController);

  return { nominaRoutes, nominaService };
}
