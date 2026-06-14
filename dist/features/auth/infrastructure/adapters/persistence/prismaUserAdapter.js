import { User } from '../../../domain/entities/User.js';
import { UserRepositoryPort } from '../../../domain/ports/UserRepositoryPort.js';
import { prisma } from '../../../../../config/prismaClient.js';
/**
 * Adaptador de persistencia de usuarios en base de datos PostgreSQL usando Prisma.
 * Implementa el puerto UserRepositoryPort.
 */
export class PrismaUserAdapter extends UserRepositoryPort {
    userInclude = {
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
    async findByUsernameOrEmail(identifier) {
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
        if (!dbUser)
            return null;
        return new User({
            id: dbUser.id,
            nombre: dbUser.nombre,
            email: dbUser.email,
            username: dbUser.username,
            rol: dbUser.role?.name || dbUser.rol,
            roleId: dbUser.roleId,
            estado: dbUser.estado,
            passwordHash: dbUser.passwordHash,
            fechaCreacion: dbUser.fechaCreacion.toISOString().split('T')[0],
            ultimoAcceso: dbUser.ultimoAcceso ? dbUser.ultimoAcceso.toISOString() : null,
            permissions: dbUser.role?.permissions.map((rp) => rp.permission.key) || [],
        });
    }
    async findByUsername(username) {
        const normalized = username.toLowerCase();
        const dbUser = await prisma.user.findFirst({
            where: {
                username: { equals: normalized, mode: 'insensitive' },
            },
            include: this.userInclude,
        });
        if (!dbUser)
            return null;
        return new User({
            id: dbUser.id,
            nombre: dbUser.nombre,
            email: dbUser.email,
            username: dbUser.username,
            rol: dbUser.role?.name || dbUser.rol,
            roleId: dbUser.roleId,
            estado: dbUser.estado,
            passwordHash: dbUser.passwordHash,
            fechaCreacion: dbUser.fechaCreacion.toISOString().split('T')[0],
            ultimoAcceso: dbUser.ultimoAcceso ? dbUser.ultimoAcceso.toISOString() : null,
            permissions: dbUser.role?.permissions.map((rp) => rp.permission.key) || [],
        });
    }
    async findById(id) {
        const dbUser = await prisma.user.findUnique({
            where: { id },
            include: this.userInclude,
        });
        if (!dbUser)
            return null;
        return new User({
            id: dbUser.id,
            nombre: dbUser.nombre,
            email: dbUser.email,
            username: dbUser.username,
            rol: dbUser.role?.name || dbUser.rol,
            roleId: dbUser.roleId,
            estado: dbUser.estado,
            passwordHash: dbUser.passwordHash,
            fechaCreacion: dbUser.fechaCreacion.toISOString().split('T')[0],
            ultimoAcceso: dbUser.ultimoAcceso ? dbUser.ultimoAcceso.toISOString() : null,
            permissions: dbUser.role?.permissions.map((rp) => rp.permission.key) || [],
        });
    }
    async create(user) {
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
            },
            include: this.userInclude,
        });
        return new User({
            id: dbUser.id,
            nombre: dbUser.nombre,
            email: dbUser.email,
            username: dbUser.username,
            rol: dbUser.role?.name || dbUser.rol,
            roleId: dbUser.roleId,
            estado: dbUser.estado,
            passwordHash: dbUser.passwordHash,
            fechaCreacion: dbUser.fechaCreacion.toISOString().split('T')[0],
            ultimoAcceso: dbUser.ultimoAcceso ? dbUser.ultimoAcceso.toISOString() : null,
            permissions: dbUser.role?.permissions.map((rp) => rp.permission.key) || [],
        });
    }
    async findAll() {
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
                rol: dbUser.role?.name || dbUser.rol,
                roleId: dbUser.roleId,
                estado: dbUser.estado,
                passwordHash: dbUser.passwordHash,
                fechaCreacion: dbUser.fechaCreacion.toISOString().split('T')[0],
                ultimoAcceso: dbUser.ultimoAcceso ? dbUser.ultimoAcceso.toISOString() : null,
                permissions: dbUser.role?.permissions.map((rp) => rp.permission.key) || [],
            });
        });
    }
    async update(user) {
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
            },
            include: this.userInclude,
        });
        return new User({
            id: dbUser.id,
            nombre: dbUser.nombre,
            email: dbUser.email,
            username: dbUser.username,
            rol: dbUser.role?.name || dbUser.rol,
            roleId: dbUser.roleId,
            estado: dbUser.estado,
            passwordHash: dbUser.passwordHash,
            fechaCreacion: dbUser.fechaCreacion.toISOString().split('T')[0],
            ultimoAcceso: dbUser.ultimoAcceso ? dbUser.ultimoAcceso.toISOString() : null,
            permissions: dbUser.role?.permissions.map((rp) => rp.permission.key) || [],
        });
    }
    async delete(id) {
        const deleted = await prisma.user.delete({
            where: { id },
        });
        return !!deleted;
    }
}
