import { Router } from 'express';
import { ProyectosController } from './proyectosController.js';
const router = Router();
const controller = new ProyectosController();
/** Rutas públicas — el cliente accede sin iniciar sesión */
router.get('/:id', (req, res) => controller.getEncuesta(req, res));
router.post('/:id', (req, res) => controller.submitEncuesta(req, res));
export default router;
