import { ProformasService } from '../../application/services/ProformasService.js';
import { createProformasController } from '../adapters/http/proformasController.js';
import { createProformasRoutes } from '../routes/proformasRoutes.js';

export async function createProformasModule() {
  const proformasService = new ProformasService();
  const proformasController = createProformasController(proformasService);
  const proformasRoutes = createProformasRoutes(proformasController);

  return { proformasRoutes, proformasService };
}
