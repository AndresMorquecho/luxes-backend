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
            }
            catch (error) {
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
        async register(req, res) {
            try {
                const { nombre, email, username, password, rol } = req.body ?? {};
                const result = await authService.register({ nombre, email, username, password, rol });
                return res.status(201).json({
                    success: true,
                    data: result.toPublic(),
                });
            }
            catch (error) {
                if (error instanceof AuthError) {
                    return res.status(error.statusCode).json({
                        success: false,
                        error: {
                            code: error.code,
                            message: error.message,
                        },
                    });
                }
                console.error('[auth/register]', error);
                return res.status(500).json({
                    success: false,
                    error: {
                        code: 'INTERNAL_ERROR',
                        message: 'Error interno del servidor',
                    },
                });
            }
        },
        async me(req, res) {
            try {
                const userId = req.user?.id;
                if (!userId) {
                    return res.status(401).json({
                        success: false,
                        error: {
                            code: 'UNAUTHORIZED',
                            message: 'Usuario no autenticado',
                        },
                    });
                }
                const userProfile = await authService.getUserById(userId);
                if (!userProfile) {
                    return res.status(404).json({
                        success: false,
                        error: {
                            code: 'USER_NOT_FOUND',
                            message: 'Usuario no encontrado',
                        },
                    });
                }
                return res.status(200).json({
                    success: true,
                    data: userProfile,
                });
            }
            catch (error) {
                console.error('[auth/me]', error);
                return res.status(500).json({
                    success: false,
                    error: {
                        code: 'INTERNAL_ERROR',
                        message: 'Error interno del servidor',
                    },
                });
            }
        },
        // --- ENDPOINTS USUARIOS ---
        async listUsers(req, res) {
            try {
                const users = await authService.listUsers();
                return res.status(200).json({
                    success: true,
                    data: users,
                });
            }
            catch (error) {
                console.error('[users/list]', error);
                return res.status(500).json({
                    success: false,
                    error: { message: 'Error al listar usuarios' },
                });
            }
        },
        async createUser(req, res) {
            try {
                const adminUser = req.user;
                const user = await authService.createUser(req.body, adminUser);
                return res.status(201).json({
                    success: true,
                    data: user,
                });
            }
            catch (error) {
                console.error('[users/create]', error);
                return res.status(400).json({
                    success: false,
                    error: { message: error.message || 'Error al crear usuario' },
                });
            }
        },
        async updateUser(req, res) {
            try {
                const adminUser = req.user;
                const { id } = req.params;
                const user = await authService.updateUser(id, req.body, adminUser);
                return res.status(200).json({
                    success: true,
                    data: user,
                });
            }
            catch (error) {
                console.error('[users/update]', error);
                return res.status(400).json({
                    success: false,
                    error: { message: error.message || 'Error al actualizar usuario' },
                });
            }
        },
        async changePassword(req, res) {
            try {
                const adminUser = req.user;
                const { id } = req.params;
                const { password } = req.body;
                if (!password) {
                    return res.status(400).json({
                        success: false,
                        error: { message: 'La contraseña es requerida' },
                    });
                }
                const user = await authService.changePassword(id, password, adminUser);
                return res.status(200).json({
                    success: true,
                    data: user,
                });
            }
            catch (error) {
                console.error('[users/password]', error);
                return res.status(400).json({
                    success: false,
                    error: { message: error.message || 'Error al cambiar contraseña' },
                });
            }
        },
        async toggleUserStatus(req, res) {
            try {
                const adminUser = req.user;
                const { id } = req.params;
                const user = await authService.toggleUserStatus(id, adminUser);
                return res.status(200).json({
                    success: true,
                    data: user,
                });
            }
            catch (error) {
                console.error('[users/toggle-status]', error);
                return res.status(400).json({
                    success: false,
                    error: { message: error.message || 'Error al cambiar estado' },
                });
            }
        },
        async deleteUser(req, res) {
            try {
                const adminUser = req.user;
                const { id } = req.params;
                await authService.deleteUser(id, adminUser);
                return res.status(200).json({
                    success: true,
                    message: 'Usuario eliminado correctamente',
                });
            }
            catch (error) {
                console.error('[users/delete]', error);
                let msg = error.message || 'Error al eliminar usuario';
                if (msg.includes('Foreign key constraint violated')) {
                    msg = 'No se puede eliminar este usuario porque tiene registros importantes vinculados (como órdenes de compra o acciones de auditoría). Por seguridad, se recomienda cambiar su estado a "Inactivo".';
                }
                return res.status(400).json({
                    success: false,
                    error: { message: msg },
                });
            }
        },
        // --- ENDPOINTS ROLES ---
        async listRoles(req, res) {
            try {
                const roles = await authService.listRoles();
                return res.status(200).json({
                    success: true,
                    data: roles,
                });
            }
            catch (error) {
                console.error('[roles/list]', error);
                return res.status(500).json({
                    success: false,
                    error: { message: 'Error al listar roles' },
                });
            }
        },
        async createRole(req, res) {
            try {
                const adminUser = req.user;
                const role = await authService.createRole(req.body, adminUser);
                return res.status(201).json({
                    success: true,
                    data: role,
                });
            }
            catch (error) {
                console.error('[roles/create]', error);
                return res.status(400).json({
                    success: false,
                    error: { message: error.message || 'Error al crear rol' },
                });
            }
        },
        async updateRole(req, res) {
            try {
                const adminUser = req.user;
                const { id } = req.params;
                const role = await authService.updateRole(id, req.body, adminUser);
                return res.status(200).json({
                    success: true,
                    data: role,
                });
            }
            catch (error) {
                console.error('[roles/update]', error);
                return res.status(400).json({
                    success: false,
                    error: { message: error.message || 'Error al actualizar rol' },
                });
            }
        },
        async deleteRole(req, res) {
            try {
                const adminUser = req.user;
                const { id } = req.params;
                await authService.deleteRole(id, adminUser);
                return res.status(200).json({
                    success: true,
                    message: 'Rol eliminado correctamente',
                });
            }
            catch (error) {
                console.error('[roles/delete]', error);
                return res.status(400).json({
                    success: false,
                    error: { message: error.message || 'Error al eliminar rol' },
                });
            }
        },
        async listPermissions(req, res) {
            try {
                const permissions = await authService.listPermissions();
                return res.status(200).json({
                    success: true,
                    data: permissions,
                });
            }
            catch (error) {
                console.error('[permissions/list]', error);
                return res.status(500).json({
                    success: false,
                    error: { message: 'Error al listar permisos' },
                });
            }
        },
        // --- ENDPOINTS AUDITORÍA ---
        async listAuditLogs(req, res) {
            try {
                const { search, userId, modulo, severidad } = req.query;
                const logs = await authService.listAuditLogs({
                    search: search,
                    userId: userId,
                    modulo: modulo,
                    severidad: severidad,
                });
                return res.status(200).json({
                    success: true,
                    data: logs,
                });
            }
            catch (error) {
                console.error('[audit-logs/list]', error);
                return res.status(500).json({
                    success: false,
                    error: { message: 'Error al listar logs de auditoría' },
                });
            }
        },
        async updateSidebarConfig(req, res) {
            try {
                const userId = req.user?.id;
                const { sidebarConfig } = req.body ?? {};
                if (!userId) {
                    return res.status(401).json({
                        success: false,
                        error: { message: 'Usuario no autenticado' }
                    });
                }
                const configStr = sidebarConfig ? JSON.stringify(sidebarConfig) : null;
                const updatedUser = await authService.updateSidebarConfig(userId, configStr ?? '');
                return res.status(200).json({
                    success: true,
                    data: updatedUser
                });
            }
            catch (error) {
                console.error('[auth/updateSidebarConfig]', error);
                return res.status(400).json({
                    success: false,
                    error: { message: error.message || 'Error al actualizar configuración' }
                });
            }
        },
    };
}
