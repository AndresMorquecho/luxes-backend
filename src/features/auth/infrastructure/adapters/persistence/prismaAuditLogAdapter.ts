import { AuditLogRepositoryPort, AuditLogPaginatedResult } from '../../../domain/ports/AuditLogRepositoryPort.js';
import { prisma } from '../../../../../config/prismaClient.js';

export class PrismaAuditLogAdapter extends AuditLogRepositoryPort {
  async create(log: {
    userId?: string;
    usuarioNom?: string;
    accion: string;
    modulo: string;
    detalle: string;
    severidad: string;
  }): Promise<any> {
    return prisma.auditLog.create({
      data: {
        userId: log.userId || null,
        usuarioNom: log.usuarioNom || null,
        accion: log.accion,
        modulo: log.modulo,
        detalle: log.detalle,
        severidad: log.severidad,
      },
    });
  }

  async findAll(filters?: {
    search?: string;
    userId?: string;
    modulo?: string;
    severidad?: string;
    page?: number;
    limit?: number;
  }): Promise<AuditLogPaginatedResult> {
    const whereClause: any = {};

    if (filters?.userId) {
      whereClause.userId = filters.userId;
    }
    if (filters?.modulo) {
      whereClause.modulo = filters.modulo;
    }
    if (filters?.severidad) {
      whereClause.severidad = { equals: filters.severidad, mode: 'insensitive' };
    }
    if (filters?.search) {
      whereClause.OR = [
        { usuarioNom: { contains: filters.search, mode: 'insensitive' } },
        { accion: { contains: filters.search, mode: 'insensitive' } },
        { detalle: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const page = Math.max(1, Number(filters?.page) || 1);
    const limit = Math.max(1, Math.min(200, Number(filters?.limit) || 20));
    const skip = (page - 1) * limit;

    const [total, data] = await Promise.all([
      prisma.auditLog.count({ where: whereClause }),
      prisma.auditLog.findMany({
        where: whereClause,
        include: {
          user: {
            select: {
              id: true,
              nombre: true,
            },
          },
        },
        orderBy: {
          fecha: 'desc',
        },
        skip,
        take: limit,
      }),
    ]);

    return {
      data,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }
}
