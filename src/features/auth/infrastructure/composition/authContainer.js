import { env } from '../../../../config/env.js';
import { AuthService } from '../../application/services/AuthService.js';
import { createAuthController } from '../adapters/http/authController.js';
import { BcryptPasswordAdapter } from '../adapters/security/bcryptPasswordAdapter.js';
import { JwtTokenAdapter } from '../adapters/security/jwtTokenAdapter.js';
import { createInMemoryUserRepository } from '../adapters/persistence/inMemoryUserAdapter.js';
import { createAuthRoutes } from '../routes/authRoutes.js';

/**
 * Composition root: cablea puertos → adaptadores → servicios.
 */
export async function createAuthModule() {
  const passwordHasher = new BcryptPasswordAdapter();
  const tokenService = new JwtTokenAdapter({
    secret: env.jwtSecret,
    expiresIn: env.jwtExpiresIn,
  });
  const userRepository = await createInMemoryUserRepository(passwordHasher);

  const authService = new AuthService({
    userRepository,
    passwordHasher,
    tokenService,
  });

  const authController = createAuthController(authService);
  const authRoutes = createAuthRoutes(authController);

  return { authRoutes, authService };
}
