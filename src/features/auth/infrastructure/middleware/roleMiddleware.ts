import { Response, NextFunction } from 'express';

/**
 * Middleware para restringir acceso según los roles permitidos.
 * Debe ser ejecutado después de authMiddleware.
 */
export function requireRoles(allowedRoles: string[]) {
  return (req: any, res: Response, next: NextFunction) => {
    const user = req.user;

    if (!user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Usuario no autenticado',
        },
      });
    }

    if (!allowedRoles.includes(user.rol)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'No tienes permisos suficientes para acceder a este recurso',
        },
      });
    }

    return next();
  };
}

/**
 * Middleware para restringir acceso según los permisos funcionales requeridos.
 * Debe ser ejecutado después de authMiddleware.
 */
export function requirePermissions(requiredPermissions: string[]) {
  return (req: any, res: Response, next: NextFunction) => {
    const user = req.user;

    if (!user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Usuario no autenticado',
        },
      });
    }

    const isSuperUser = user.rol.toLowerCase() === 'admin' || user.rol.toLowerCase() === 'administrador';
    if (isSuperUser) {
      return next();
    }

    const hasPermission = requiredPermissions.every((perm) =>
      user.permissions?.includes(perm),
    );

    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'No tienes los permisos funcionales suficientes para acceder a este recurso',
        },
      });
    }

    return next();
  };
}
