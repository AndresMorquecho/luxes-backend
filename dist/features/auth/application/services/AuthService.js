import { loginUser } from '../../domain/use-cases/loginUser.js';
import { registerUser } from '../../domain/use-cases/registerUser.js';
import { prisma } from '../../../../config/prismaClient.js';
/**
 * Servicio de aplicación: orquesta casos de uso e inyecta puertos.
 */
export class AuthService {
    userRepository;
    passwordHasher;
    tokenService;
    roleRepository;
    auditLogRepository;
    constructor({ userRepository, passwordHasher, tokenService, roleRepository, auditLogRepository, }) {
        this.userRepository = userRepository;
        this.passwordHasher = passwordHasher;
        this.tokenService = tokenService;
        this.roleRepository = roleRepository;
        this.auditLogRepository = auditLogRepository;
    }
    async login({ username, password }) {
        const result = await loginUser({ username, password }, {
            userRepository: this.userRepository,
            passwordHasher: this.passwordHasher,
            tokenService: this.tokenService,
        });
        // Actualizar último acceso del usuario logueado
        const user = await this.userRepository.findById(result.user.id);
        if (user) {
            user.ultimoAcceso = new Date().toISOString();
            await this.userRepository.update(user);
        }
        return result;
    }
    async register({ nombre, email, username, password, rol, }) {
        return registerUser({ nombre, email, username, password, rol }, {
            userRepository: this.userRepository,
            passwordHasher: this.passwordHasher,
        });
    }
    async getUserById(id) {
        const user = await this.userRepository.findById(id);
        if (!user)
            return null;
        return user.toPublic();
    }
    // --- MÓDULO DE GESTIÓN DE USUARIOS (CRUD) ---
    async listUsers() {
        const users = await this.userRepository.findAll();
        return users.map((u) => u.toPublic());
    }
    async createUser(data, adminUser) {
        const user = await registerUser({
            nombre: data.nombre,
            email: data.email,
            username: data.username,
            password: data.password,
            rol: data.rol,
        }, {
            userRepository: this.userRepository,
            passwordHasher: this.passwordHasher,
        });
        const u = await this.userRepository.findById(user.id);
        if (u) {
            if (data.roleId)
                u.roleId = data.roleId;
            u.estado = data.estado || 'activo';
            // 1:1 Link - Generate Empleado
            const records = await prisma.empleado.findMany({ select: { id: true } });
            const maxNum = records.reduce((max, record) => {
                const match = record.id.match(/^EMP-(\d+)$/);
                if (!match)
                    return max;
                const num = parseInt(match[1], 10);
                return num > max ? num : max;
            }, 0);
            const nextEmpId = `EMP-${String(maxNum + 1).padStart(3, '0')}`;
            const dummyCedula = '99' + String(maxNum + 1).padStart(8, '0');
            await prisma.empleado.create({
                data: {
                    id: nextEmpId,
                    nombre: data.nombre,
                    cedula: dummyCedula,
                    correo: data.email || `${data.username}@luxes.com`,
                    cargo: data.rol || 'visor',
                    passwordHash: u.passwordHash,
                }
            });
            u.empleadoId = nextEmpId;
            await this.userRepository.update(u);
        }
        // Registrar en auditoría
        if (this.auditLogRepository) {
            await this.auditLogRepository.create({
                userId: adminUser?.id,
                usuarioNom: adminUser?.nombre,
                accion: 'Crear usuario',
                modulo: 'Usuarios y Roles',
                detalle: `Creó el usuario ${data.nombre} (${data.username}) con rol ${data.rol || 'visor'}`,
                severidad: 'Info',
            });
        }
        const updatedUser = await this.userRepository.findById(user.id);
        return updatedUser ? updatedUser.toPublic() : user.toPublic();
    }
    async updateUser(id, data, adminUser) {
        const user = await this.userRepository.findById(id);
        if (!user)
            throw new Error('Usuario no encontrado');
        user.nombre = data.nombre ?? user.nombre;
        user.email = data.email ?? user.email;
        user.username = data.username ?? user.username;
        if (data.roleId !== undefined)
            user.roleId = data.roleId;
        if (data.rol !== undefined)
            user.rol = data.rol;
        if (data.estado !== undefined)
            user.estado = data.estado;
        const updated = await this.userRepository.update(user);
        // Sync with Empleado
        if (user.empleadoId) {
            await prisma.empleado.update({
                where: { id: user.empleadoId },
                data: {
                    nombre: user.nombre,
                    correo: user.email,
                }
            });
        }
        else {
            // Legacy user link creation
            const records = await prisma.empleado.findMany({ select: { id: true } });
            const maxNum = records.reduce((max, record) => {
                const match = record.id.match(/^EMP-(\d+)$/);
                if (!match)
                    return max;
                const num = parseInt(match[1], 10);
                return num > max ? num : max;
            }, 0);
            const nextEmpId = `EMP-${String(maxNum + 1).padStart(3, '0')}`;
            const dummyCedula = '99' + String(maxNum + 1).padStart(8, '0');
            await prisma.empleado.create({
                data: {
                    id: nextEmpId,
                    nombre: user.nombre,
                    cedula: dummyCedula,
                    correo: user.email || `${user.username}@luxes.com`,
                    cargo: user.rol || 'visor',
                    passwordHash: user.passwordHash,
                }
            });
            user.empleadoId = nextEmpId;
            await this.userRepository.update(user);
        }
        // Registrar en auditoría
        if (this.auditLogRepository) {
            await this.auditLogRepository.create({
                userId: adminUser?.id,
                usuarioNom: adminUser?.nombre,
                accion: 'Editar usuario',
                modulo: 'Usuarios y Roles',
                detalle: `Editó los datos del usuario ${user.nombre} (${user.username})`,
                severidad: 'Info',
            });
        }
        return updated.toPublic();
    }
    async toggleUserStatus(id, adminUser) {
        const user = await this.userRepository.findById(id);
        if (!user)
            throw new Error('Usuario no encontrado');
        user.estado = user.estado === 'activo' ? 'inactivo' : 'activo';
        const updated = await this.userRepository.update(user);
        // Registrar en auditoría
        if (this.auditLogRepository) {
            await this.auditLogRepository.create({
                userId: adminUser?.id,
                usuarioNom: adminUser?.nombre,
                accion: user.estado === 'activo' ? 'Activar usuario' : 'Desactivar usuario',
                modulo: 'Usuarios y Roles',
                detalle: `${user.estado === 'activo' ? 'Activó' : 'Desactivó'} al usuario ${user.nombre} (${user.username})`,
                severidad: 'Critico',
            });
        }
        return updated.toPublic();
    }
    async changePassword(id, passwordNew, adminUser) {
        const user = await this.userRepository.findById(id);
        if (!user)
            throw new Error('Usuario no encontrado');
        user.passwordHash = await this.passwordHasher.hash(passwordNew);
        const updated = await this.userRepository.update(user);
        // Registrar en auditoría
        if (this.auditLogRepository) {
            await this.auditLogRepository.create({
                userId: adminUser?.id,
                usuarioNom: adminUser?.nombre,
                accion: 'Cambiar contraseña',
                modulo: 'Usuarios y Roles',
                detalle: `Cambió la contraseña del usuario ${user.nombre} (${user.username})`,
                severidad: 'Advertencia',
            });
        }
        return updated.toPublic();
    }
    async deleteUser(id, adminUser) {
        const user = await this.userRepository.findById(id);
        if (!user)
            throw new Error('Usuario no encontrado');
        const result = await this.userRepository.delete(id);
        // Sync deletion with Empleado
        if (user.empleadoId) {
            await prisma.empleado.delete({
                where: { id: user.empleadoId }
            }).catch(() => { });
        }
        // Registrar en auditoría
        if (this.auditLogRepository) {
            await this.auditLogRepository.create({
                userId: adminUser?.id,
                usuarioNom: adminUser?.nombre,
                accion: 'Eliminar usuario',
                modulo: 'Usuarios y Roles',
                detalle: `Eliminó de forma permanente al usuario ${user.nombre} (${user.username})`,
                severidad: 'Critico',
            });
        }
        return result;
    }
    // --- MÓDULO DE GESTIÓN DE ROLES Y PERMISOS ---
    async listRoles() {
        if (!this.roleRepository)
            return [];
        return this.roleRepository.findAll();
    }
    async createRole(data, adminUser) {
        if (!this.roleRepository)
            throw new Error('Repositorio de roles no configurado');
        const role = await this.roleRepository.create({
            name: data.name,
            description: data.description,
            permissions: data.permissions || [],
        });
        if (this.auditLogRepository) {
            await this.auditLogRepository.create({
                userId: adminUser?.id,
                usuarioNom: adminUser?.nombre,
                accion: 'Crear rol',
                modulo: 'Usuarios y Roles',
                detalle: `Creó el rol ${data.name} con ${data.permissions?.length || 0} permisos`,
                severidad: 'Info',
            });
        }
        return role;
    }
    async updateRole(id, data, adminUser) {
        if (!this.roleRepository)
            throw new Error('Repositorio de roles no configurado');
        const role = await this.roleRepository.update(id, {
            name: data.name,
            description: data.description,
            permissions: data.permissions || [],
        });
        if (this.auditLogRepository) {
            await this.auditLogRepository.create({
                userId: adminUser?.id,
                usuarioNom: adminUser?.nombre,
                accion: 'Editar rol',
                modulo: 'Usuarios y Roles',
                detalle: `Actualizó el rol ${data.name} asignándole ${data.permissions?.length || 0} permisos`,
                severidad: 'Advertencia',
            });
        }
        return role;
    }
    async deleteRole(id, adminUser) {
        if (!this.roleRepository)
            throw new Error('Repositorio de roles no configurado');
        const role = await this.roleRepository.findById(id);
        if (!role)
            throw new Error('Rol no encontrado');
        const result = await this.roleRepository.delete(id);
        if (this.auditLogRepository) {
            await this.auditLogRepository.create({
                userId: adminUser?.id,
                usuarioNom: adminUser?.nombre,
                accion: 'Eliminar rol',
                modulo: 'Usuarios y Roles',
                detalle: `Eliminó el rol ${role.name}`,
                severidad: 'Critico',
            });
        }
        return result;
    }
    async listPermissions() {
        if (!this.roleRepository)
            return [];
        return this.roleRepository.findAllPermissions();
    }
    // --- HISTORIAL DE AUDITORÍA ---
    async listAuditLogs(filters) {
        if (!this.auditLogRepository)
            return [];
        return this.auditLogRepository.findAll(filters);
    }
    async createAuditLog(log) {
        if (!this.auditLogRepository)
            return null;
        return this.auditLogRepository.create(log);
    }
    async updateSidebarConfig(userId, sidebarConfig) {
        const user = await this.userRepository.findById(userId);
        if (!user)
            throw new Error('Usuario no encontrado');
        user.sidebarConfig = sidebarConfig;
        const updated = await this.userRepository.update(user);
        return updated.toPublic();
    }
}
