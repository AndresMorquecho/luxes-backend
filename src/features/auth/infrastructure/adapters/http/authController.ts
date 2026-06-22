import { Request, Response } from 'express';
import { AuthError } from '../../../domain/errors/AuthErrors.js';
import { AuthService } from '../../../application/services/AuthService.js';

export interface AuthController {
  login(req: Request, res: Response): Promise<Response>;
  register(req: Request, res: Response): Promise<Response>;
  me(req: any, res: Response): Promise<Response>;
  // Gestión de Usuarios
  listUsers(req: Request, res: Response): Promise<Response>;
  createUser(req: any, res: Response): Promise<Response>;
  updateUser(req: any, res: Response): Promise<Response>;
  changePassword(req: any, res: Response): Promise<Response>;
  toggleUserStatus(req: any, res: Response): Promise<Response>;
  deleteUser(req: any, res: Response): Promise<Response>;
  // Gestión de Roles y Permisos
  listRoles(req: Request, res: Response): Promise<Response>;
  createRole(req: any, res: Response): Promise<Response>;
  updateRole(req: any, res: Response): Promise<Response>;
  deleteRole(req: any, res: Response): Promise<Response>;
  listPermissions(req: Request, res: Response): Promise<Response>;
  // Historial de Auditoría
  listAuditLogs(req: Request, res: Response): Promise<Response>;
  // Personalización de interfaz
  updateSidebarConfig(req: any, res: Response): Promise<Response>;
}

/**
 * Adaptador HTTP: traduce requests Express al servicio de aplicación.
 */
export function createAuthController(authService: AuthService): AuthController {
  return {
    async login(req: Request, res: Response): Promise<Response> {
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

    async register(req: Request, res: Response): Promise<Response> {
      try {
        const { nombre, email, username, password, rol } = req.body ?? {};
        const result = await authService.register({ nombre, email, username, password, rol });

        return res.status(201).json({
          success: true,
          data: result.toPublic(),
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

    async me(req: any, res: Response): Promise<Response> {
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
      } catch (error) {
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

    async listUsers(req: Request, res: Response): Promise<Response> {
      try {
        const users = await authService.listUsers();
        return res.status(200).json({
          success: true,
          data: users,
        });
      } catch (error) {
        console.error('[users/list]', error);
        return res.status(500).json({
          success: false,
          error: { message: 'Error al listar usuarios' },
        });
      }
    },

    async createUser(req: any, res: Response): Promise<Response> {
      try {
        const adminUser = req.user;
        const user = await authService.createUser(req.body, adminUser);
        return res.status(201).json({
          success: true,
          data: user,
        });
      } catch (error: any) {
        console.error('[users/create]', error);
        return res.status(400).json({
          success: false,
          error: { message: error.message || 'Error al crear usuario' },
        });
      }
    },

    async updateUser(req: any, res: Response): Promise<Response> {
      try {
        const adminUser = req.user;
        const { id } = req.params;
        const user = await authService.updateUser(id, req.body, adminUser);
        return res.status(200).json({
          success: true,
          data: user,
        });
      } catch (error: any) {
        console.error('[users/update]', error);
        return res.status(400).json({
          success: false,
          error: { message: error.message || 'Error al actualizar usuario' },
        });
      }
    },

    async changePassword(req: any, res: Response): Promise<Response> {
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
      } catch (error: any) {
        console.error('[users/password]', error);
        return res.status(400).json({
          success: false,
          error: { message: error.message || 'Error al cambiar contraseña' },
        });
      }
    },

    async toggleUserStatus(req: any, res: Response): Promise<Response> {
      try {
        const adminUser = req.user;
        const { id } = req.params;
        const user = await authService.toggleUserStatus(id, adminUser);
        return res.status(200).json({
          success: true,
          data: user,
        });
      } catch (error: any) {
        console.error('[users/toggle-status]', error);
        return res.status(400).json({
          success: false,
          error: { message: error.message || 'Error al cambiar estado' },
        });
      }
    },

    async deleteUser(req: any, res: Response): Promise<Response> {
      try {
        const adminUser = req.user;
        const { id } = req.params;
        await authService.deleteUser(id, adminUser);
        return res.status(200).json({
          success: true,
          message: 'Usuario eliminado correctamente',
        });
      } catch (error: any) {
        console.error('[users/delete]', error);
        return res.status(400).json({
          success: false,
          error: { message: error.message || 'Error al eliminar usuario' },
        });
      }
    },

    // --- ENDPOINTS ROLES ---

    async listRoles(req: Request, res: Response): Promise<Response> {
      try {
        const roles = await authService.listRoles();
        return res.status(200).json({
          success: true,
          data: roles,
        });
      } catch (error) {
        console.error('[roles/list]', error);
        return res.status(500).json({
          success: false,
          error: { message: 'Error al listar roles' },
        });
      }
    },

    async createRole(req: any, res: Response): Promise<Response> {
      try {
        const adminUser = req.user;
        const role = await authService.createRole(req.body, adminUser);
        return res.status(201).json({
          success: true,
          data: role,
        });
      } catch (error: any) {
        console.error('[roles/create]', error);
        return res.status(400).json({
          success: false,
          error: { message: error.message || 'Error al crear rol' },
        });
      }
    },

    async updateRole(req: any, res: Response): Promise<Response> {
      try {
        const adminUser = req.user;
        const { id } = req.params;
        const role = await authService.updateRole(id, req.body, adminUser);
        return res.status(200).json({
          success: true,
          data: role,
        });
      } catch (error: any) {
        console.error('[roles/update]', error);
        return res.status(400).json({
          success: false,
          error: { message: error.message || 'Error al actualizar rol' },
        });
      }
    },

    async deleteRole(req: any, res: Response): Promise<Response> {
      try {
        const adminUser = req.user;
        const { id } = req.params;
        await authService.deleteRole(id, adminUser);
        return res.status(200).json({
          success: true,
          message: 'Rol eliminado correctamente',
        });
      } catch (error: any) {
        console.error('[roles/delete]', error);
        return res.status(400).json({
          success: false,
          error: { message: error.message || 'Error al eliminar rol' },
        });
      }
    },

    async listPermissions(req: Request, res: Response): Promise<Response> {
      try {
        const permissions = await authService.listPermissions();
        return res.status(200).json({
          success: true,
          data: permissions,
        });
      } catch (error) {
        console.error('[permissions/list]', error);
        return res.status(500).json({
          success: false,
          error: { message: 'Error al listar permisos' },
        });
      }
    },

    // --- ENDPOINTS AUDITORÍA ---

    async listAuditLogs(req: Request, res: Response): Promise<Response> {
      try {
        const { search, userId, modulo, severidad } = req.query;
        const logs = await authService.listAuditLogs({
          search: search as string,
          userId: userId as string,
          modulo: modulo as string,
          severidad: severidad as string,
        });
        return res.status(200).json({
          success: true,
          data: logs,
        });
      } catch (error) {
        console.error('[audit-logs/list]', error);
        return res.status(500).json({
          success: false,
          error: { message: 'Error al listar logs de auditoría' },
        });
      }
    },

    async updateSidebarConfig(req: any, res: Response): Promise<Response> {
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
      } catch (error: any) {
        console.error('[auth/updateSidebarConfig]', error);
        return res.status(400).json({
          success: false,
          error: { message: error.message || 'Error al actualizar configuración' }
        });
      }
    },
  };
}
