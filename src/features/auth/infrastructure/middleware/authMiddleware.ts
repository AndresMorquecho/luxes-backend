import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../../../../config/env.js';
import { prisma } from '../../../../config/prismaClient.js';

export interface AuthPayload {
  sub: string;
  rol: string;
  email: string;
  permissions?: string[];
}

type SessionIdentity = {
  nombre: string;
  estado: string;
  archivedAt: Date | null;
  empleado: { archivedAt: Date | null } | null;
};

/** Check the stored identity on each request, including JWTs issued before offboarding. */
export function createAuthMiddleware(findUser: (id: string) => Promise<SessionIdentity | null> = id => prisma.user.findUnique({
  where: { id },
  select: { nombre: true, estado: true, archivedAt: true, empleado: { select: { archivedAt: true } } },
})) {
  return async function authMiddleware(req: any, res: Response, next: NextFunction) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No se proporcionó token de autenticación' } });
    }
    let decoded: AuthPayload;
    try {
      decoded = jwt.verify(header.split(' ')[1], env.jwtSecret) as AuthPayload;
      if (typeof decoded.sub !== 'string' || !decoded.sub) throw new Error('Missing identity');
    } catch {
      return res.status(401).json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Token de autenticación inválido o expirado' } });
    }
    let user: SessionIdentity | null;
    try {
      user = await findUser(decoded.sub);
    } catch {
      return res.status(503).json({ success: false, error: { code: 'AUTH_UNAVAILABLE', message: 'No se pudo verificar la sesión. Intenta nuevamente.' } });
    }
    if (!user || user.estado !== 'activo' || user.archivedAt || user.empleado?.archivedAt) {
      return res.status(401).json({ success: false, error: { code: 'INACTIVE_USER', message: 'La cuenta está inactiva o dada de baja' } });
    }
    req.user = { id: decoded.sub, nombre: user.nombre, rol: decoded.rol, email: decoded.email, permissions: decoded.permissions || [] };
    return next();
  };
}

export const authMiddleware = createAuthMiddleware();
