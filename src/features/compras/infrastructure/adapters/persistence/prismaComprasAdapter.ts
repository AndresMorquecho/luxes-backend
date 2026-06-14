import { PrismaClient } from '@prisma/client';
import type {
  ComprasRepositoryPort,
  OrdenCompraData,
  ProveedorData,
  MetodoPagoData,
  AbonoCompraData,
  CuentaPorPagarData,
  DetalleCompraInput,
} from '../../../domain/ports/ComprasRepositoryPort.js';
import webpush from 'web-push';
import { env } from '../../../../../config/env.js';

// Configure VAPID details for Web Push
if (env.vapidPublicKey && env.vapidPrivateKey) {
  webpush.setVapidDetails(
    env.vapidEmail,
    env.vapidPublicKey,
    env.vapidPrivateKey
  );
}

export class PrismaComprasAdapter implements ComprasRepositoryPort {
  constructor(private readonly prisma: PrismaClient) {}

  // ── Proveedores ────────────────────────────────────────────────────────────

  async findAllProveedores(): Promise<ProveedorData[]> {
    const rows = await this.prisma.proveedor.findMany({
      orderBy: { nombre: 'asc' },
    });
    return rows as unknown as ProveedorData[];
  }

  async createProveedor(data: any): Promise<ProveedorData> {
    const row = await this.prisma.proveedor.create({ data });
    return row as unknown as ProveedorData;
  }

  async updateProveedor(id: string, data: any): Promise<ProveedorData> {
    const row = await this.prisma.proveedor.update({ where: { id }, data });
    return row as unknown as ProveedorData;
  }

  async deleteProveedor(id: string): Promise<void> {
    await this.prisma.proveedor.delete({ where: { id } });
  }

  // ── Órdenes de Compra ──────────────────────────────────────────────────────

  private readonly ordenInclude = {
    proveedor: true,
    usuario: { select: { id: true, nombre: true, email: true } },
    aprobadoPor: { select: { id: true, nombre: true, email: true } },
    detalles: true,
    abonos: { include: { metodoPago: true }, orderBy: { fecha: 'desc' as const } },
    cuentaPorPagar: true,
  };

  async findAllOrdenes(options?: {
    page?: number;
    limit?: number;
    search?: string;
    estado?: string;
    estadoPago?: string;
  }): Promise<{ items: OrdenCompraData[]; total: number }> {
    const { page = 1, limit = 10, search, estado, estadoPago } = options || {};

    const where: any = {};
    if (estado) where.estado = estado;
    if (estadoPago) where.estadoPago = estadoPago;
    if (search) {
      where.OR = [
        { numero: { contains: search, mode: 'insensitive' } },
        { proveedor: { nombre: { contains: search, mode: 'insensitive' } } },
        { concepto: { contains: search, mode: 'insensitive' } },
        { notas: { contains: search, mode: 'insensitive' } },
        { usuario: { nombre: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const skip = (page - 1) * limit;
    const [rows, total] = await Promise.all([
      this.prisma.ordenCompra.findMany({
        where,
        include: this.ordenInclude,
        orderBy: { fechaCreacion: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.ordenCompra.count({ where }),
    ]);

    return {
      items: rows as unknown as OrdenCompraData[],
      total,
    };
  }

  async findOrdenById(id: string): Promise<OrdenCompraData | null> {
    const row = await this.prisma.ordenCompra.findUnique({
      where: { id },
      include: this.ordenInclude,
    });
    return row as unknown as OrdenCompraData | null;
  }

  async getNextOrdenNumero(): Promise<string> {
    const year = new Date().getFullYear();
    const suffix = `_${year}`;
    const last = await this.prisma.ordenCompra.findFirst({
      where: {
        numero: { endsWith: suffix },
      },
      orderBy: { numero: 'desc' },
      select: { numero: true },
    });
    if (!last) return `ORC_001_${year}`;
    const parts = last.numero.split('_');
    const num = parseInt(parts[1], 10);
    return `ORC_${String(num + 1).padStart(3, '0')}_${year}`;
  }

  async createOrden(data: {
    proveedorId: string;
    usuarioId: string;
    fecha?: Date;
    impuesto?: number;
    concepto?: string;
    notas?: string;
    detalles: DetalleCompraInput[];
    fechaVencimiento?: Date | null;
  }): Promise<OrdenCompraData> {
    const numero = await this.getNextOrdenNumero();

    // Calculate totals
    const detallesData = data.detalles.map(d => ({
      descripcion: d.descripcion,
      cantidad: d.cantidad,
      precioUnitario: d.precioUnitario,
      subtotal: d.cantidad * d.precioUnitario,
      materialId: d.materialId || null,
    }));

    const subtotal = detallesData.reduce((sum, d) => sum + d.subtotal, 0);
    const impuesto = data.impuesto || 0;
    const total = subtotal + impuesto;

    const row = await this.prisma.ordenCompra.create({
      data: {
        numero,
        proveedor: { connect: { id: data.proveedorId } },
        usuario: { connect: { id: data.usuarioId } },
        fecha: data.fecha ? new Date(data.fecha) : new Date(),
        subtotal,
        impuesto,
        total,
        concepto: data.concepto,
        notas: data.notas,
        detalles: {
          create: detallesData.map(d => ({
            descripcion: d.descripcion,
            cantidad: d.cantidad,
            precioUnitario: d.precioUnitario,
            subtotal: d.subtotal,
            materialId: d.materialId,
          })),
        },
        cuentaPorPagar: {
          create: {
            montoTotal: total,
            montoPagado: 0,
            saldo: total,
            estado: 'pendiente',
            fechaVencimiento: data.fechaVencimiento ? new Date(data.fechaVencimiento) : null,
          },
        },
      },
      include: this.ordenInclude,
    });

    // Generate notification for administrators
    try {
      // Get user name for notification
      const usuario = await this.prisma.user.findUnique({
        where: { id: data.usuarioId },
        select: { nombre: true }
      });
      
      const notif = await this.prisma.notification.create({
        data: {
          title: 'Nueva Orden de Compra',
          message: `Se ha generado la orden de compra ${row.numero} por un valor de $${row.total.toFixed(2)} pendiente de aprobación.`,
          rol: 'admin',
          permission: 'aprobacion_ordenes_compra',
          createdBy: usuario?.nombre || 'Usuario desconocido',
        }
      });

      // Dispatch Web Push Notifications
      // 1. Get all users who have the 'aprobacion_ordenes_compra' permission, or are administrators
      const adminUsers = await this.prisma.user.findMany({
        where: {
          OR: [
            { rol: { in: ['admin', 'administrador'] } },
            {
              role: {
                permissions: {
                  some: {
                    permission: {
                      key: 'aprobacion_ordenes_compra'
                    }
                  }
                }
              }
            }
          ]
        },
        include: {
          pushSubscriptions: true
        }
      });

      // 2. Loop through users and their subscriptions to send push messages
      const pushPayload = JSON.stringify({
        title: notif.title,
        body: notif.message,
        url: '/compras/aprobaciones'
      });

      for (const user of adminUsers) {
        for (const sub of user.pushSubscriptions) {
          try {
            const subscriptionParams = {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.p256dh,
                auth: sub.auth
              }
            };
            await webpush.sendNotification(subscriptionParams, pushPayload);
          } catch (pushErr: any) {
            console.error(`[Web Push Error] Failed to send to endpoint ${sub.endpoint}:`, pushErr.message);
            // If subscription is expired/invalid (404 or 410), delete it from the database
            if (pushErr.statusCode === 404 || pushErr.statusCode === 410) {
              await this.prisma.pushSubscription.delete({ where: { endpoint: sub.endpoint } });
            }
          }
        }
      }
    } catch (err) {
      console.error('[Notification Generation Error]', err);
    }

    return row as unknown as OrdenCompraData;
  }

  async updateOrden(id: string, data: {
    proveedorId?: string;
    fecha?: Date;
    impuesto?: number;
    estado?: string;
    concepto?: string;
    notas?: string;
    detalles?: DetalleCompraInput[];
    aprobadoPorId?: string;
  }): Promise<OrdenCompraData> {
    const updateData: any = {};
    if (data.proveedorId) updateData.proveedor = { connect: { id: data.proveedorId } };
    if (data.fecha) updateData.fecha = new Date(data.fecha);
    if (data.estado) {
      updateData.estado = data.estado;
      // Si se está aprobando la orden y viene el usuario aprobador, establecer fecha y usuario
      if (data.estado === 'aprobada' && data.aprobadoPorId) {
        updateData.fechaAprobacion = new Date();
        updateData.aprobadoPor = { connect: { id: data.aprobadoPorId } };
      }
    }
    if (data.concepto !== undefined) updateData.concepto = data.concepto;
    if (data.notas !== undefined) updateData.notas = data.notas;

    if (data.detalles) {
      // Recalculate totals
      const detallesData = data.detalles.map(d => ({
        descripcion: d.descripcion,
        cantidad: d.cantidad,
        precioUnitario: d.precioUnitario,
        subtotal: d.cantidad * d.precioUnitario,
        materialId: d.materialId || undefined,
      }));

      const subtotal = detallesData.reduce((sum, d) => sum + d.subtotal, 0);
      const impuesto = data.impuesto ?? 0;
      const total = subtotal + impuesto;

      updateData.subtotal = subtotal;
      updateData.impuesto = impuesto;
      updateData.total = total;

      // Delete old details and create new ones
      await this.prisma.detalleCompra.deleteMany({ where: { ordenCompraId: id } });
      updateData.detalles = {
        create: detallesData.map(d => ({
          descripcion: d.descripcion,
          cantidad: d.cantidad,
          precioUnitario: d.precioUnitario,
          subtotal: d.subtotal,
          ...(d.materialId ? { materialId: d.materialId } : {}),
        })),
      };

      // Update CxP total
      const cxp = await this.prisma.cuentaPorPagar.findUnique({
        where: { ordenCompraId: id },
      });
      if (cxp) {
        await this.prisma.cuentaPorPagar.update({
          where: { id: cxp.id },
          data: {
            montoTotal: total,
            saldo: total - cxp.montoPagado,
            estado: cxp.montoPagado >= total ? 'pagado' : cxp.montoPagado > 0 ? 'parcial' : 'pendiente',
          },
        });
      }
    } else if (data.impuesto !== undefined) {
      const existing = await this.prisma.ordenCompra.findUnique({
        where: { id },
        select: { subtotal: true },
      });
      if (existing) {
        updateData.impuesto = data.impuesto;
        updateData.total = existing.subtotal + data.impuesto;
      }
    }

    const row = await this.prisma.ordenCompra.update({
      where: { id },
      data: updateData,
      include: this.ordenInclude,
    });

    return row as unknown as OrdenCompraData;
  }

  async deleteOrden(id: string): Promise<void> {
    await this.prisma.ordenCompra.delete({ where: { id } });
  }

  // ── Abonos ─────────────────────────────────────────────────────────────────

  async findAbonosByOrden(ordenId: string): Promise<AbonoCompraData[]> {
    const rows = await this.prisma.abonoCompra.findMany({
      where: { ordenCompraId: ordenId },
      include: { metodoPago: true },
      orderBy: { fecha: 'desc' },
    });
    return rows as unknown as AbonoCompraData[];
  }

  async createAbono(data: {
    ordenCompraId: string;
    metodoPagoId: string;
    monto: number;
    referencia?: string;
  }): Promise<AbonoCompraData> {
    const row = await this.prisma.abonoCompra.create({
      data: {
        ordenCompra: { connect: { id: data.ordenCompraId } },
        metodoPago: { connect: { id: data.metodoPagoId } },
        monto: data.monto,
        referencia: data.referencia,
      },
      include: { metodoPago: true },
    });
    return row as unknown as AbonoCompraData;
  }

  // ── Cuentas por Pagar ──────────────────────────────────────────────────────

  async findAllCuentasPorPagar(options?: {
    page?: number;
    limit?: number;
    estado?: string;
  }): Promise<{ items: CuentaPorPagarData[]; total: number }> {
    const { page = 1, limit = 10, estado } = options || {};

    const where: any = {};
    if (estado) where.estado = estado;

    const skip = (page - 1) * limit;
    const [rows, total] = await Promise.all([
      this.prisma.cuentaPorPagar.findMany({
        where,
        include: {
          ordenCompra: {
            include: { proveedor: true },
          },
        },
        orderBy: { ordenCompra: { fechaCreacion: 'desc' } },
        skip,
        take: limit,
      }),
      this.prisma.cuentaPorPagar.count({ where }),
    ]);

    return {
      items: rows as unknown as CuentaPorPagarData[],
      total,
    };
  }

  async updateCuentaPorPagar(id: string, data: {
    montoPagado: number;
    saldo: number;
    estado: string;
  }): Promise<CuentaPorPagarData> {
    const row = await this.prisma.cuentaPorPagar.update({
      where: { id },
      data,
      include: { ordenCompra: { include: { proveedor: true } } },
    });
    return row as unknown as CuentaPorPagarData;
  }

  // ── Métodos de Pago ────────────────────────────────────────────────────────

  async findAllMetodosPago(): Promise<MetodoPagoData[]> {
    const rows = await this.prisma.metodoPago.findMany({
      orderBy: { nombre: 'asc' },
    });
    return rows as unknown as MetodoPagoData[];
  }

  async createMetodoPago(data: { nombre: string; descripcion?: string }): Promise<MetodoPagoData> {
    const row = await this.prisma.metodoPago.create({ data });
    return row as unknown as MetodoPagoData;
  }

  async updateMetodoPago(id: string, data: { nombre?: string; descripcion?: string; activo?: boolean }): Promise<MetodoPagoData> {
    const row = await this.prisma.metodoPago.update({ where: { id }, data });
    return row as unknown as MetodoPagoData;
  }

  async deleteMetodoPago(id: string): Promise<void> {
    await this.prisma.metodoPago.delete({ where: { id } });
  }

  // ── Stats ──────────────────────────────────────────────────────────────────

  async getComprasStats(): Promise<{
    totalOrdenes: number;
    pendientes: number;
    totalGastado: number;
    totalDeuda: number;
  }> {
    const [totalOrdenes, pendientes, gastadoResult, deudaResult] = await Promise.all([
      this.prisma.ordenCompra.count(),
      this.prisma.ordenCompra.count({ where: { estado: 'pendiente' } }),
      this.prisma.ordenCompra.aggregate({ _sum: { total: true } }),
      this.prisma.cuentaPorPagar.aggregate({
        _sum: { saldo: true },
        where: { estado: { not: 'pagado' } },
      }),
    ]);

    return {
      totalOrdenes,
      pendientes,
      totalGastado: gastadoResult._sum.total || 0,
      totalDeuda: deudaResult._sum.saldo || 0,
    };
  }

  // ── Inventario Helpers ──

  async adjustMaterialStock(materialId: string, cantidad: number): Promise<void> {
    await this.prisma.material.update({
      where: { id: materialId },
      data: {
        stockActual: { increment: cantidad },
      },
    });
  }

  async createMaterialMovimiento(data: {
    materialId: string;
    tipo: string;
    cantidad: number;
    motivo: string;
    userId?: string | null;
  }): Promise<void> {
    await this.prisma.movimientoInventario.create({
      data: {
        materialId: data.materialId,
        tipo: data.tipo,
        cantidad: data.cantidad,
        motivo: data.motivo,
        userId: data.userId || null,
      },
    });
  }
}
