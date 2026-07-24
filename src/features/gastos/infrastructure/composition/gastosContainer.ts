import { GastosController } from '../adapters/http/gastosController.js';
import { VehiculosController } from '../adapters/http/vehiculosController.js';
import { GastosFijosController } from '../adapters/http/gastosFijosController.js';
import { createGastosRoutes } from '../routes/gastosRoutes.js';
import type { Router } from 'express';

export async function createGastosModule(): Promise<{
  gastosRouter: Router;
  vehiculosRouter: Router;
}> {
  const gastosController = new GastosController();
  const vehiculosController = new VehiculosController();
  const gastosFijosController = new GastosFijosController();
  
  const { gastosRouter, vehiculosRouter } = createGastosRoutes(
    gastosController,
    vehiculosController,
    gastosFijosController
  );

  return { gastosRouter, vehiculosRouter };
}
