import { PrismaClient } from '@prisma/client';
import type {
  MaterialRepositoryPort,
  MaterialData,
  MovimientoData,
  PrestamoData,
} from '../../../domain/ports/MaterialRepositoryPort.js';
import { formatDateOnly } from '../../../../../shared/utils/dateOnly.js';

const ESTADOS_COMPRA_VALIDOS = new Set(['aprobada', 'recibida', 'parcialmente_recibida']);

export class PrismaMaterialAdapter implements MaterialRepositoryPort {
  constructor(private readonly prisma: PrismaClient) {}

  // ── Materiales ──────────────────────────────────────────────────────────────

  private mapRow(row: any): MaterialData {
    if (!row) return null as any;
    const { unidadMedida, detallesCompra, ...rest } = row;

    const purchases = detallesCompra || [];
    const approvedPurchases = purchases.filter((d: any) => {
      const estado = String(d.ordenCompra?.estado || '').toLowerCase();
      return ESTADOS_COMPRA_VALIDOS.has(estado);
    });

    let cpp = row.precioCosto || 0;
    let ultimaFechaCompra: string | null = null;
    if (approvedPurchases.length > 0) {
      const totalCost = approvedPurchases.reduce((sum: number, d: any) => sum + (d.cantidad * d.precioUnitario), 0);
      const totalQty = approvedPurchases.reduce((sum: number, d: any) => sum + d.cantidad, 0);
      if (totalQty > 0) {
        cpp = totalCost / totalQty;
      }

      const fechasCompra = approvedPurchases
        .map((d: any) => d.fechaRecepcion || d.ordenCompra?.fechaRecepcion || d.ordenCompra?.fechaAprobacion || d.ordenCompra?.fecha)
        .map((f: Date | string | null | undefined) => formatDateOnly(f))
        .filter((f: string | null): f is string => !!f);
      if (fechasCompra.length > 0) {
        ultimaFechaCompra = fechasCompra.sort().reverse()[0];
      }
    }

    return {
      ...rest,
      costoPromedioPonderado: cpp,
      ultimaFechaCompra,
      unidadMedida: row.unidadMedida ? {
        id: row.unidadMedida.id,
        nombre: row.unidadMedida.nombre,
        abreviacion: row.unidadMedida.abreviacion
      } : { nombre: 'unidades', abreviacion: 'unid' },
      aCargoEmpleado: row.aCargoEmpleado ? {
        id: row.aCargoEmpleado.id,
        nombre: row.aCargoEmpleado.nombre
      } : null,
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
            aCargoEmpleado: { select: { id: true, nombre: true } },
            detallesCompra: { include: { ordenCompra: true } }
          },
          orderBy: [{ tipo: 'asc' }, { nombre: 'asc' }],
        }),
        this.prisma.material.count({ where }),
      ]);
      const mapped = rows.map(r => this.mapRow(r));
      if (tipo === 'consumible') {
        mapped.sort((a, b) => {
          const da = a.ultimaFechaCompra || '';
          const db = b.ultimaFechaCompra || '';
          if (db !== da) return db.localeCompare(da);
          return (a.nombre || '').localeCompare(b.nombre || '', 'es');
        });
      }
      return {
        items: mapped.slice(skip, skip + limit),
        total,
      };
    } else {
      const rows = await this.prisma.material.findMany({
        where,
        include: { 
          unidadMedida: true,
          aCargoEmpleado: { select: { id: true, nombre: true } },
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
        aCargoEmpleado: { select: { id: true, nombre: true } },
        detallesCompra: { include: { ordenCompra: true } }
      },
    });
    return this.mapRow(row);
  }

  async create(data: Omit<MaterialData, 'id' | 'fechaCreacion'>): Promise<MaterialData> {
    const { unidadMedida, costoPromedioPonderado, ultimaFechaCompra, ...rest } = data as any;

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
      include: { 
        unidadMedida: true,
        aCargoEmpleado: { select: { id: true, nombre: true } },
      }
    });
    return this.mapRow(row);
  }

  async update(id: string, data: Partial<Omit<MaterialData, 'id' | 'fechaCreacion'>>): Promise<MaterialData> {
    const { unidadMedida, costoPromedioPonderado, ultimaFechaCompra, ...rest } = data as any;

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
      include: { 
        unidadMedida: true,
        aCargoEmpleado: { select: { id: true, nombre: true } },
      }
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

  async createMovimiento(data: Omit<MovimientoData, 'id' | 'fecha'> & { fecha?: Date }): Promise<MovimientoData> {
    const row = await this.prisma.movimientoInventario.create({
      data: {
        tipo: data.tipo,
        cantidad: data.cantidad,
        motivo: data.motivo,
        userId: data.userId,
        ...(data.fecha ? { fecha: data.fecha } : {}),
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
        material: { select: { nombre: true, tipo: true, codigo: true, unidadMedida: true } },
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
        material: { select: { nombre: true, tipo: true, codigo: true, unidadMedida: true } },
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
        fechaDevolucionEsperada: (data as any).fechaDevolucionEsperada
          ? new Date((data as any).fechaDevolucionEsperada)
          : null,
        material: { connect: { id: data.materialId } },
        responsable: { connect: { id: data.responsableId } },
      },
      include: {
        material: { select: { nombre: true, tipo: true, codigo: true, unidadMedida: true } },
        responsable: { select: { nombre: true, username: true } },
      },
    });
    return row as unknown as PrestamoData;
  }

  async returnPrestamo(id: string, fechaRetorno: Date, observacionDevolucion?: string | null): Promise<PrestamoData> {
    const row = await this.prisma.prestamo.update({
      where: { id },
      data: {
        fechaRetorno,
        estado: 'devuelto',
        ...(observacionDevolucion != null && observacionDevolucion !== ''
          ? { observacionDevolucion }
          : {}),
      },
      include: {
        material: { select: { nombre: true, tipo: true, codigo: true, unidadMedida: true } },
        responsable: { select: { nombre: true, username: true } },
      },
    });
    return row as unknown as PrestamoData;
  }

  async adjustStock(materialId: string, delta: number): Promise<void> {
    await this.prisma.material.update({
      where: { id: materialId },
      data: { stockActual: { increment: delta } },
    });
  }

  async getMaterialHistorial(idOrCodigo: string): Promise<any> {
    const material = await this.prisma.material.findFirst({
      where: {
        OR: [
          { id: idOrCodigo },
          { codigo: idOrCodigo }
        ]
      },
      include: { unidadMedida: true }
    });
    if (!material) throw new Error('Material no encontrado.');
    const id = material.id;

    // 1. Query Compras (DetalleCompra)
    const detallesCompra = await this.prisma.detalleCompra.findMany({
      where: { materialId: id },
      include: {
        ordenCompra: {
          include: { proveedor: true }
        }
      },
      orderBy: { ordenCompra: { fecha: 'desc' } }
    });

    const compras = detallesCompra.map(d => ({
      id: d.id,
      ordenId: d.ordenCompraId,
      numero: d.ordenCompra.numero,
      fecha: d.ordenCompra.fecha ? formatDateOnly(d.ordenCompra.fecha) || '' : '',
      fechaRecepcion: formatDateOnly(d.fechaRecepcion || d.ordenCompra.fechaRecepcion) || '',
      proveedor: d.ordenCompra.proveedor?.nombre || 'Sin proveedor',
      cantidad: d.cantidad,
      cantidadRecibida: d.cantidadRecibida,
      precioUnitario: d.precioUnitario,
      subtotal: d.subtotal,
      estado: d.ordenCompra.estado
    }));

    // 2. Query Movimientos (MovimientoInventario)
    const movimientosDb = await this.prisma.movimientoInventario.findMany({
      where: { materialId: id },
      orderBy: { fecha: 'desc' }
    });

    const movimientos = movimientosDb.map(m => ({
      id: m.id,
      tipo: m.tipo,
      cantidad: m.cantidad,
      motivo: m.motivo,
      fecha: m.fecha ? new Date(m.fecha).toISOString() : ''
    }));

    // 3. Query Usos en Proyectos (ProyectoFase)
    const fasesInstalacion = await this.prisma.proyectoFase.findMany({
      where: {
        fase: 'INSTALACION'
      },
      include: {
        proyecto: true
      }
    });

    const usos: any[] = [];
    const matSku = material.codigo || '';
    const matNombreLower = material.nombre.toLowerCase();

    for (const fase of fasesInstalacion) {
      if (!fase.datos) continue;
      try {
        const datos = JSON.parse(fase.datos);
        const materiales = datos.materiales;
        if (Array.isArray(materiales)) {
          const matched = materiales.filter((m: any) => 
            (m.sku && m.sku === matSku) || 
            (m.nombre && m.nombre.toLowerCase() === matNombreLower)
          );

          for (const m of matched) {
            usos.push({
              proyectoId: fase.proyectoId,
              proyectoNombre: fase.proyecto.nombre,
              cliente: fase.proyecto.clienteEmpresa || fase.proyecto.clienteNombre || 'Sin cliente',
              cantidad: m.cantidadLaveada !== undefined ? m.cantidadLaveada : (m.cantidadLlevada !== undefined ? m.cantidadLlevada : (m.cantidad || 0)),
              unidad: m.unidad || '',
              fecha: datos.fechaInstalacion || (fase.fechaCompletada ? new Date(fase.fechaCompletada).toISOString().split('T')[0] : ''),
              responsable: m.responsable || datos.personalAsignado?.[0]?.nombre || 'Sin asignar',
              observacion: m.observacion || m.observaciones || ''
            });
          }
        }
      } catch (err) {
        console.error('Error parsing fase datos:', err);
      }
    }

    usos.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

    return {
      material: {
        id: material.id,
        nombre: material.nombre,
        codigo: material.codigo,
        categoria: material.categoria,
        tipo: material.tipo,
        stockActual: material.stockActual,
        unidadMedida: material.unidadMedida ? {
          nombre: material.unidadMedida.nombre,
          abreviacion: material.unidadMedida.abreviacion
        } : { nombre: 'unidades', abreviacion: 'unid' }
      },
      compras,
      usos,
      movimientos
    };
  }
}
