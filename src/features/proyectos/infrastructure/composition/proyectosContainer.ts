import proyectosRoutes from '../adapters/http/proyectosRoutes.js';
import encuestaRoutes from '../adapters/http/encuestaRoutes.js';

export async function createProyectosModule() {
  return {
    proyectosRoutes,
    encuestaRoutes,
  };
}
