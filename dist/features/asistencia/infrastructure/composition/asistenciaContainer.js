import { AsistenciaService } from '../../application/services/AsistenciaService.js';
import { PrismaAsistenciaAdapter } from '../adapters/persistence/prismaAsistenciaAdapter.js';
import { AsistenciaController } from '../adapters/http/asistenciaController.js';
import { createAsistenciaRoutes } from '../routes/asistenciaRoutes.js';
export async function createAsistenciaModule() {
    const asistenciaRepository = new PrismaAsistenciaAdapter();
    const asistenciaService = new AsistenciaService(asistenciaRepository);
    const asistenciaController = new AsistenciaController(asistenciaService);
    const asistenciaRoutes = createAsistenciaRoutes(asistenciaController);
    return { asistenciaRoutes, asistenciaService };
}
