import { PrismaClient } from '@prisma/client';
import { PrismaComprasAdapter } from '../adapters/persistence/prismaComprasAdapter.js';
import { ComprasService } from '../../application/services/ComprasService.js';
import { ComprasController } from '../adapters/http/comprasController.js';
import { createComprasRoutes } from '../routes/comprasRoutes.js';
export async function createComprasModule() {
    const prisma = new PrismaClient();
    const repo = new PrismaComprasAdapter(prisma);
    const service = new ComprasService(repo);
    const controller = new ComprasController(service);
    const comprasRoutes = createComprasRoutes(controller);
    return { comprasRoutes };
}
