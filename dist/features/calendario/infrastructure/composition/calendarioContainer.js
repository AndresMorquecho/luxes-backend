import { CalendarioService } from '../../application/services/CalendarioService.js';
import { RutinasService } from '../../application/services/RutinasService.js';
import { CalendarioController } from '../adapters/http/calendarioController.js';
import { RutinasController } from '../adapters/http/rutinasController.js';
import { createCalendarioRoutes } from '../routes/calendarioRoutes.js';
export function createCalendarioModule() {
    const calService = new CalendarioService();
    const rutService = new RutinasService();
    const calController = new CalendarioController(calService);
    const rutController = new RutinasController(rutService);
    const { calendarioRouter, rutinasRouter } = createCalendarioRoutes(calController, rutController);
    return {
        calendarioRouter,
        rutinasRouter,
        calService,
        rutService,
    };
}
