import { EmpleadoService } from '../../application/services/EmpleadoService.js';
import { PrismaEmpleadoAdapter } from '../adapters/persistence/prismaEmpleadoAdapter.js';
import { createEmpleadosController } from '../adapters/http/empleadosController.js';
import { createEmpleadosRoutes } from '../routes/empleadosRoutes.js';

export async function createEmpleadosModule() {
  const empleadoRepository = new PrismaEmpleadoAdapter();
  const empleadoService = new EmpleadoService(empleadoRepository);
  const empleadosController = createEmpleadosController(empleadoService);
  const empleadosRoutes = createEmpleadosRoutes(empleadosController);

  return { empleadosRoutes, empleadoService };
}
