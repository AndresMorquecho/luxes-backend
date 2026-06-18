import { ProformasController } from '../adapters/http/proformasController.js';
import { createProformasRoutes } from '../routes/proformasRoutes.js';
import type { Router } from 'express';

export async function createProformasModule(): Promise<{ proformasRoutes: Router }> {
  const controller = new ProformasController();
  const proformasRoutes = createProformasRoutes(controller);
  return { proformasRoutes };
}
