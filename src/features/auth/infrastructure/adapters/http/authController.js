import { AuthError } from '../../../domain/errors/AuthErrors.js';

/**
 * Adaptador HTTP: traduce requests Express al servicio de aplicación.
 */
export function createAuthController(authService) {
  return {
    async login(req, res) {
      try {
        const { username, password } = req.body ?? {};
        const result = await authService.login({ username, password });

        return res.status(200).json({
          success: true,
          data: result,
        });
      } catch (error) {
        if (error instanceof AuthError) {
          return res.status(error.statusCode).json({
            success: false,
            error: {
              code: error.code,
              message: error.message,
            },
          });
        }

        console.error('[auth/login]', error);
        return res.status(500).json({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Error interno del servidor',
          },
        });
      }
    },
  };
}
