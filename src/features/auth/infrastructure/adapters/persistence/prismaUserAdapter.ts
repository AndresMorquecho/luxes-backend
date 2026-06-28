import { User } from '../../../domain/entities/User.js';
import { UserRepositoryPort } from '../../../domain/ports/UserRepositoryPort.js';
import { prisma } from '../../../../../config/prismaClient.js';

/** El quiosco y cuentas de sistema usan users.rol; no deben reemplazarse por RBAC genérico. */
function resolveUserRol(dbUser: { rol: string; username: string; role?: { name: string } | null }): string {
  const slug = (dbUser.rol || '').toLowerCase().trim();
  const username = (dbUser.username || '').toLowerCase().trim();
  const roleName = dbUser.role?.name?.trim() || '';
  const roleSlug = roleName.toLowerCase();

  if (slug === 'asistencia' || username === 'asistencia') return 'asistencia';
  if (slug === 'taller' || username === 'taller') return dbUser.rol || 'Taller';

  // Cuenta principal de administración
  if (username === 'admin') {
    if (roleSlug === 'admin' || roleSlug === 'administrador') return roleName;
    if (slug === 'admin' || slug === 'administrador') return dbUser.rol;
    return 'Administrador';
  }

  // Cuentas admin/asistencia/taller: users.rol manda sobre un rol RBAC secundario (ej. Visor)
  if (slug === 'admin' || slug === 'administrador') return dbUser.rol;

  // Sin slug de sistema en users.rol, pero el rol RBAC es administrador
  if (roleSlug === 'admin' || roleSlug === 'administrador') return roleName;

  return roleName || dbUser.rol;
}

/**
 * Adaptador de persistencia de usuarios en base de datos PostgreSQL usando Prisma.
 * Implementa el puerto UserRepositoryPort.
 */
export class PrismaUserAdapter extends UserRepositoryPort {
  private readonly userInclude = {
    role: {
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
      },
    },
  };

  async findByUsernameOrEmail(identifier: string): Promise<User | null> {
    const normalized = identifier.toLowerCase();
    const dbUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: { equals: normalized, mode: 'insensitive' } },
          { username: { equals: normalized, mode: 'insensitive' } },
        ],
      },
      include: this.userInclude,
    });

    if (!dbUser) return null;

    return new User({
      id: dbUser.id,
      nombre: dbUser.nombre,
      email: dbUser.email,
      username: dbUser.username,
      rol: resolveUserRol(dbUser),
      roleId: dbUser.roleId,
      estado: dbUser.estado,
      passwordHash: dbUser.passwordHash,
      fechaCreacion: dbUser.fechaCreacion.toISOString().split('T')[0],
      ultimoAcceso: dbUser.ultimoAcceso ? dbUser.ultimoAcceso.toISOString() : null,
      permissions: dbUser.role?.permissions.map((rp: any) => rp.permission.key) || [],
      sidebarConfig: dbUser.sidebarConfig,
      empleadoId: dbUser.empleadoId,
    });
  }

  async findByUsername(username: string): Promise<User | null> {
    const normalized = username.toLowerCase();
    const dbUser = await prisma.user.findFirst({
      where: {
        username: { equals: normalized, mode: 'insensitive' },
      },
      include: this.userInclude,
    });

    if (!dbUser) return null;

    return new User({
      id: dbUser.id,
      nombre: dbUser.nombre,
      email: dbUser.email,
      username: dbUser.username,
      rol: resolveUserRol(dbUser),
      roleId: dbUser.roleId,
      estado: dbUser.estado,
      passwordHash: dbUser.passwordHash,
      fechaCreacion: dbUser.fechaCreacion.toISOString().split('T')[0],
      ultimoAcceso: dbUser.ultimoAcceso ? dbUser.ultimoAcceso.toISOString() : null,
      permissions: dbUser.role?.permissions.map((rp: any) => rp.permission.key) || [],
      sidebarConfig: dbUser.sidebarConfig,
      empleadoId: dbUser.empleadoId,
    });
  }

  async findById(id: string): Promise<User | null> {
    const dbUser = await prisma.user.findUnique({
      where: { id },
      include: this.userInclude,
    });

    if (!dbUser) return null;

    return new User({
      id: dbUser.id,
      nombre: dbUser.nombre,
      email: dbUser.email,
      username: dbUser.username,
      rol: resolveUserRol(dbUser),
      roleId: dbUser.roleId,
      estado: dbUser.estado,
      passwordHash: dbUser.passwordHash,
      fechaCreacion: dbUser.fechaCreacion.toISOString().split('T')[0],
      ultimoAcceso: dbUser.ultimoAcceso ? dbUser.ultimoAcceso.toISOString() : null,
      permissions: dbUser.role?.permissions.map((rp: any) => rp.permission.key) || [],
      sidebarConfig: dbUser.sidebarConfig,
      empleadoId: dbUser.empleadoId,
    });
  }

  async create(user: User): Promise<User> {
    const dbUser = await prisma.user.create({
      data: {
        id: user.id,
        nombre: user.nombre,
        email: user.email,
        username: user.username,
        rol: user.rol,
        roleId: user.roleId,
        estado: user.estado,
        passwordHash: user.passwordHash,
        sidebarConfig: user.sidebarConfig,
        empleadoId: user.empleadoId,
      },
      include: this.userInclude,
    });

    return new User({
      id: dbUser.id,
      nombre: dbUser.nombre,
      email: dbUser.email,
      username: dbUser.username,
      rol: resolveUserRol(dbUser),
      roleId: dbUser.roleId,
      estado: dbUser.estado,
      passwordHash: dbUser.passwordHash,
      fechaCreacion: dbUser.fechaCreacion.toISOString().split('T')[0],
      ultimoAcceso: dbUser.ultimoAcceso ? dbUser.ultimoAcceso.toISOString() : null,
      permissions: dbUser.role?.permissions.map((rp: any) => rp.permission.key) || [],
      sidebarConfig: dbUser.sidebarConfig,
      empleadoId: dbUser.empleadoId,
    });
  }

  async findAll(): Promise<User[]> {
    const dbUsers = await prisma.user.findMany({
      include: this.userInclude,
      orderBy: {
        fechaCreacion: 'desc',
      },
    });

    return dbUsers.map((dbUser) => {
      return new User({
        id: dbUser.id,
        nombre: dbUser.nombre,
        email: dbUser.email,
        username: dbUser.username,
        rol: resolveUserRol(dbUser),
        roleId: dbUser.roleId,
        estado: dbUser.estado,
        passwordHash: dbUser.passwordHash,
        fechaCreacion: dbUser.fechaCreacion.toISOString().split('T')[0],
        ultimoAcceso: dbUser.ultimoAcceso ? dbUser.ultimoAcceso.toISOString() : null,
        permissions: dbUser.role?.permissions.map((rp: any) => rp.permission.key) || [],
        sidebarConfig: dbUser.sidebarConfig,
        empleadoId: dbUser.empleadoId,
      });
    });
  }

  async update(user: User): Promise<User> {
    const dbUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        nombre: user.nombre,
        email: user.email,
        username: user.username,
        rol: user.rol,
        roleId: user.roleId,
        estado: user.estado,
        passwordHash: user.passwordHash,
        ultimoAcceso: user.ultimoAcceso ? new Date(user.ultimoAcceso) : null,
        sidebarConfig: user.sidebarConfig,
        empleadoId: user.empleadoId,
      },
      include: this.userInclude,
    });

    return new User({
      id: dbUser.id,
      nombre: dbUser.nombre,
      email: dbUser.email,
      username: dbUser.username,
      rol: resolveUserRol(dbUser),
      roleId: dbUser.roleId,
      estado: dbUser.estado,
      passwordHash: dbUser.passwordHash,
      fechaCreacion: dbUser.fechaCreacion.toISOString().split('T')[0],
      ultimoAcceso: dbUser.ultimoAcceso ? dbUser.ultimoAcceso.toISOString() : null,
      permissions: dbUser.role?.permissions.map((rp: any) => rp.permission.key) || [],
      sidebarConfig: dbUser.sidebarConfig,
      empleadoId: dbUser.empleadoId,
    });
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await prisma.user.delete({
      where: { id },
    });
    return !!deleted;
  }
}
