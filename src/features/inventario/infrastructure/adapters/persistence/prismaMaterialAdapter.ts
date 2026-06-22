import { PrismaClient } from '@prisma/client';
import type {
  MaterialRepositoryPort,
  MaterialData,
  MovimientoData,
  PrestamoData,
} from '../../../domain/ports/MaterialRepositoryPort.js';

export class PrismaMaterialAdapter implements MaterialRepositoryPort {
  constructor(private readonly prisma: PrismaClient) {}

  // ── Materiales ──────────────────────────────────────────────────────────────

  private mapRow(row: any): MaterialData {
    if (!row) return null as any;
    const { unidadMedida, detallesCompra, ...rest } = row;

    const purchases = detallesCompra || [];
    const approvedPurchases = purchases.filter((d: any) => 
      d.ordenCompra && (d.ordenCompra.estado === 'APROBADA' || d.ordenCompra.estado === 'RECIBIDA')
    );

    let cpp = row.precioCosto || 0;
    if (approvedPurchases.length > 0) {
      const totalCost = approvedPurchases.reduce((sum: number, d: any) => sum + (d.cantidad * d.precioUnitario), 0);
      const totalQty = approvedPurchases.reduce((sum: number, d: any) => sum + d.cantidad, 0);
      if (totalQty > 0) {
        cpp = totalCost / totalQty;
      }
    }

    return {
      ...rest,
      costoPromedioPonderado: cpp,
      unidadMedida: row.unidadMedida ? {
        id: row.unidadMedida.id,
        nombre: row.unidadMedida.nombre,
        abreviacion: row.unidadMedida.abreviacion
      } : { nombre: 'unidades', abreviacion: 'unid' },
    } as unknown as MaterialData;
  }

  async findAll(options?: {
    tipo?: string;
    page?: number;
    limit?: number;
    search?: string;
    categoria?: string;
  }): Promise<{ items: MaterialData[]; total: number } | MaterialData[]> {
    const { tipo, page, limit, search, categoria } = options || {};

    const where: any = {};
    if (tipo) {
      where.tipo = tipo;
    }
    if (categoria) {
      where.categoria = categoria;
    }
    if (search) {
      where.OR = [
        { nombre: { contains: search, mode: 'insensitive' } },
        { codigo: { contains: search, mode: 'insensitive' } },
        { marca: { contains: search, mode: 'insensitive' } },
        { modelo: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (page !== undefined && limit !== undefined) {
      const skip = (page - 1) * limit;
      const [rows, total] = await Promise.all([
        this.prisma.material.findMany({
          where,
          include: { 
            unidadMedida: true,
            detallesCompra: { include: { ordenCompra: true } }
          },
          orderBy: [{ tipo: 'asc' }, { nombre: 'asc' }],
          skip,
          take: limit,
        }),
        this.prisma.material.count({ where }),
      ]);
      return {
        items: rows.map(r => this.mapRow(r)),
        total,
      };
    } else {
      const rows = await this.prisma.material.findMany({
        where,
        include: { 
          unidadMedida: true,
          detallesCompra: { include: { ordenCompra: true } }
        },
        orderBy: [{ tipo: 'asc' }, { nombre: 'asc' }],
      });
      return rows.map(r => this.mapRow(r));
    }
  }

  async findById(id: string): Promise<MaterialData | null> {
    const row = await this.prisma.material.findUnique({
      where: { id },
      include: { 
        unidadMedida: true,
        detallesCompra: { include: { ordenCompra: true } }
      },
    });
    return this.mapRow(row);
  }

  async create(data: Omit<MaterialData, 'id' | 'fechaCreacion'>): Promise<MaterialData> {
    const { unidadMedida, ...rest } = data as any;

    let unidadMedidaId = (data as any).unidadMedidaId;
    const unitName = typeof unidadMedida === 'string' ? unidadMedida : unidadMedida?.nombre;
    if (!unidadMedidaId && unitName) {
      const unit = await this.prisma.unidadMedida.upsert({
        where: { nombre: unitName },
        update: {},
        create: { nombre: unitName }
      });
      unidadMedidaId = unit.id;
    }

    const row = await this.prisma.material.create({
      data: {
        ...rest,
        unidadMedidaId,
      },
      include: { unidadMedida: true }
    });
    return this.mapRow(row);
  }

  async update(id: string, data: Partial<Omit<MaterialData, 'id' | 'fechaCreacion'>>): Promise<MaterialData> {
    const { unidadMedida, ...rest } = data as any;

    let unidadMedidaId = (data as any).unidadMedidaId;
    const unitName = typeof unidadMedida === 'string' ? unidadMedida : unidadMedida?.nombre;
    if (!unidadMedidaId && unitName) {
      const unit = await this.prisma.unidadMedida.upsert({
        where: { nombre: unitName },
        update: {},
        create: { nombre: unitName }
      });
      unidadMedidaId = unit.id;
    }

    const row = await this.prisma.material.update({
      where: { id },
      data: {
        ...rest,
        ...(unidadMedidaId ? { unidadMedidaId } : {}),
      },
      include: { unidadMedida: true }
    });
    return this.mapRow(row);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.material.delete({ where: { id } });
  }

  async getStats(): Promise<{
    totalMateriales: number;
    totalLowStock: number;
    activeLoans: number;
    returnedLoans: number;
  }> {
    const totalMateriales = await this.prisma.material.count();
    const lowStockResult = await this.prisma.$queryRawUnsafe<{ count: number }[]>(
      `SELECT COUNT(*)::int as count FROM "materiales" WHERE "stock_actual" > 0 AND "stock_actual" <= "stock_minimo"`
    );
    const totalLowStock = lowStockResult[0]?.count || 0;
    const activeLoans = await this.prisma.prestamo.count({
      where: { estado: 'prestado' },
    });
    const returnedLoans = await this.prisma.prestamo.count({
      where: { estado: 'devuelto' },
    });

    return {
      totalMateriales,
      totalLowStock,
      activeLoans,
      returnedLoans,
    };
  }

  async findAllUnidades(): Promise<any[]> {
    return this.prisma.unidadMedida.findMany({
      orderBy: { nombre: 'asc' }
    });
  }

  // ── Movimientos ──────────────────────────────────────────────────────────────

  async listMovimientos(materialId?: string): Promise<MovimientoData[]> {
    const rows = await this.prisma.movimientoInventario.findMany({
      where: materialId ? { materialId } : undefined,
      orderBy: { fecha: 'desc' },
    });
    return rows as unknown as MovimientoData[];
  }

  async createMovimiento(data: Omit<MovimientoData, 'id' | 'fecha'>): Promise<MovimientoData> {
    const row = await this.prisma.movimientoInventario.create({
      data: {
        tipo: data.tipo,
        cantidad: data.cantidad,
        motivo: data.motivo,
        userId: data.userId,
        material: { connect: { id: data.materialId } },
      },
    });
    return row as unknown as MovimientoData;
  }

  // ── Préstamos ────────────────────────────────────────────────────────────────

  async listPrestamos(estado?: string): Promise<PrestamoData[]> {
    const rows = await this.prisma.prestamo.findMany({
      where: estado ? { estado } : undefined,
      include: {
        material: { select: { nombre: true, tipo: true, unidadMedida: true } },
        responsable: { select: { nombre: true, username: true } },
      },
      orderBy: { fechaSalida: 'desc' },
    });
    return rows as unknown as PrestamoData[];
  }

  async findPrestamoById(id: string): Promise<PrestamoData | null> {
    const row = await this.prisma.prestamo.findUnique({
      where: { id },
      include: {
        material: { select: { nombre: true, tipo: true, unidadMedida: true } },
        responsable: { select: { nombre: true, username: true } },
      },
    });
    return row as unknown as PrestamoData | null;
  }

  async createPrestamo(data: Omit<PrestamoData, 'id' | 'fechaSalida'>): Promise<PrestamoData> {
    const row = await this.prisma.prestamo.create({
      data: {
        cantidad: data.cantidad,
        comentarios: data.comentarios,
        estado: data.estado ?? 'prestado',
        material: { connect: { id: data.materialId } },
        responsable: { connect: { id: data.responsableId } },
      },
      include: {
        material: { select: { nombre: true, tipo: true, unidadMedida: true } },
        responsable: { select: { nombre: true, username: true } },
      },
    });
    return row as unknown as PrestamoData;
  }

  async returnPrestamo(id: string, fechaRetorno: Date): Promise<PrestamoData> {
    const row = await this.prisma.prestamo.update({
      where: { id },
      data: { fechaRetorno, estado: 'devuelto' },
      include: {
        material: { select: { nombre: true, tipo: true, unidadMedida: true } },
        responsable: { select: { nombre: true, username: true } },
      },
    });
    return row as unknown as PrestamoData;
  }

  // ── Stock ───────────────────────────────────────────────────────────────────

  async adjustStock(materialId: string, delta: number): Promise<void> {
    await this.prisma.material.update({
      where: { id: materialId },
      data: { stockActual: { increment: delta } },
    });
  }
}
