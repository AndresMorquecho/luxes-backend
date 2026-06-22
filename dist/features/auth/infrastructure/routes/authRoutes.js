import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { requireRoles } from '../middleware/roleMiddleware.js';
/**
 * Rutas HTTP del módulo de autenticación y gestión de usuarios.
 */
export function createAuthRoutes(authController) {
    const router = Router();
    // Rutas públicas de Login/Registro básico
    router.post('/login', (req, res) => authController.login(req, res));
    router.post('/register', (req, res) => authController.register(req, res));
    // Rutas protegidas (Usuario Autenticado)
    router.get('/me', authMiddleware, (req, res) => authController.me(req, res));
    router.put('/users/me/sidebar-config', authMiddleware, (req, res) => authController.updateSidebarConfig(req, res));
    // --- GESTIÓN DE USUARIOS (Solo Admins) ---
    router.get('/users', authMiddleware, requireRoles(['admin', 'Administrador']), (req, res) => authController.listUsers(req, res));
    router.post('/users', authMiddleware, requireRoles(['admin', 'Administrador']), (req, res) => authController.createUser(req, res));
    router.put('/users/:id', authMiddleware, requireRoles(['admin', 'Administrador']), (req, res) => authController.updateUser(req, res));
    router.put('/users/:id/password', authMiddleware, requireRoles(['admin', 'Administrador']), (req, res) => authController.changePassword(req, res));
    router.put('/users/:id/toggle-status', authMiddleware, requireRoles(['admin', 'Administrador']), (req, res) => authController.toggleUserStatus(req, res));
    router.delete('/users/:id', authMiddleware, requireRoles(['admin', 'Administrador']), (req, res) => authController.deleteUser(req, res));
    // --- GESTIÓN DE ROLES Y PERMISOS (Solo Admins) ---
    router.get('/roles', authMiddleware, (req, res) => authController.listRoles(req, res));
    router.post('/roles', authMiddleware, requireRoles(['admin', 'Administrador']), (req, res) => authController.createRole(req, res));
    router.put('/roles/:id', authMiddleware, requireRoles(['admin', 'Administrador']), (req, res) => authController.updateRole(req, res));
    router.delete('/roles/:id', authMiddleware, requireRoles(['admin', 'Administrador']), (req, res) => authController.deleteRole(req, res));
    router.get('/permissions', authMiddleware, requireRoles(['admin', 'Administrador']), (req, res) => authController.listPermissions(req, res));
    // --- HISTORIAL DE AUDITORÍA (Solo Admins) ---
    router.get('/audit-logs', authMiddleware, requireRoles(['admin', 'Administrador']), (req, res) => authController.listAuditLogs(req, res));
    // Ruta de prueba protegida por roles (original)
    router.get('/admin-only', authMiddleware, requireRoles(['admin', 'Administrador']), (req, res) => {
        res.json({
            success: true,
            message: 'Acceso concedido a la sección administrativa',
        });
    });
    return router;
}
