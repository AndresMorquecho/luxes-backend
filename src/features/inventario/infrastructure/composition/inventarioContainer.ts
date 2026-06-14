import { PrismaClient } from '@prisma/client';
import { PrismaMaterialAdapter } from '../adapters/persistence/prismaMaterialAdapter.js';
import { InventarioService } from '../../application/services/InventarioService.js';
import { InventarioController } from '../adapters/http/inventarioController.js';
import { createInventarioRoutes } from '../routes/inventarioRoutes.js';
import type { Router } from 'express';

export async function createInventarioModule(): Promise<{ inventarioRoutes: Router }> {
  const prisma = new PrismaClient();
  const repo = new PrismaMaterialAdapter(prisma);
  const service = new InventarioService(repo);
  const controller = new InventarioController(service);
  const inventarioRoutes = createInventarioRoutes(controller);

  return { inventarioRoutes };
}
