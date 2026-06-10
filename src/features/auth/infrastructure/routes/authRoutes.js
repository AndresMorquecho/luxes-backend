import { Router } from 'express';

/**
 * Rutas HTTP del módulo de autenticación.
 */
export function createAuthRoutes(authController) {
  const router = Router();

  router.post('/login', (req, res) => authController.login(req, res));

  return router;
}
