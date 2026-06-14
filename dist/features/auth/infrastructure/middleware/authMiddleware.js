import jwt from 'jsonwebtoken';
import { env } from '../../../../config/env.js';
/**
 * Middleware para validar el token JWT y adjuntar el usuario autenticado a `req.user`.
 */
export function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            error: {
                code: 'UNAUTHORIZED',
                message: 'No se proporcionó token de autenticación',
            },
        });
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, env.jwtSecret);
        req.user = {
            id: decoded.sub,
            rol: decoded.rol,
            email: decoded.email,
            permissions: decoded.permissions || [],
        };
        return next();
    }
    catch (error) {
        return res.status(401).json({
            success: false,
            error: {
                code: 'INVALID_TOKEN',
                message: 'Token de autenticación inválido o expirado',
            },
        });
    }
}
