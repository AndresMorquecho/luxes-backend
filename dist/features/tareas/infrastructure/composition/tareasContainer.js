import { PrismaClient } from '@prisma/client';
import { PrismaTareasAdapter } from '../adapters/persistence/prismaTareasAdapter.js';
import { TareasService } from '../../application/services/TareasService.js';
import { TareasController } from '../adapters/http/tareasController.js';
import { createTareasRoutes } from '../routes/tareasRoutes.js';
export async function createTareasModule() {
    const prisma = new PrismaClient();
    const repo = new PrismaTareasAdapter(prisma);
    const service = new TareasService(repo);
    const controller = new TareasController(service);
    const tareasRoutes = createTareasRoutes(controller);
    return { tareasRoutes };
}
