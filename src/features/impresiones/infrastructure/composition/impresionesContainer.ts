import { ImpresionesController } from '../adapters/http/impresionesController.js';
import { createImpresionesRoutes } from '../routes/impresionesRoutes.js';
import type { Router } from 'express';

export async function createImpresionesModule(): Promise<{ impresionesRoutes: Router }> {
  const controller = new ImpresionesController();
  const impresionesRoutes = createImpresionesRoutes(controller);
  return { impresionesRoutes };
}
