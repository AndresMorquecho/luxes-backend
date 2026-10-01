import { addPurchasePayment, processPurchaseCheque, syncPurchaseBalance } from '../../../../../shared/services/compraPayments.js';
import { lockOrder } from './compraLifecycle.js';
import { receiveOrder, createRoll, cancellationPreview, cancelOrder, type RecepcionInput, type AnulacionInput } from './compraLifecycle.js';
import { PrismaClient } from '@prisma/client';
import type {
  ComprasRepositoryPort,
  OrdenCompraData,
  ProveedorData,
  MetodoPagoData,
  AbonoCompraData,
  CuentaPorPagarData,
  CreateCuentaPorPagarManualInput,
  DetalleCompraInput,
  DetalleCompraData,
} from '../../../domain/ports/ComprasRepositoryPort.js';
import webpush from 'web-push';
import { env } from '../../../../../config/env.js';
import { procesarChequesVencidos } from '../../../../../shared/services/chequesSchedulerService.js';

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

  recepcionarOrdenAtomica(id: string, userId: string, input: RecepcionInput) {
    return receiveOrder(this.prisma, id, userId, input) as Promise<OrdenCompraData>;
  }
  previewAnulacion(id: string) { return this.prisma.$transaction(tx => cancellationPreview(tx, id), { isolationLevel: 'RepeatableRead' }); }
  anularOrden(id: string, userId: string, input: AnulacionInput) { return cancelOrder(this.prisma, id, userId, input); }

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
    usuario: { select: { id: true, nombre: true, email: true, rol: true } },
    aprobadoPor: { select: { id: true, nombre: true, email: true, rol: true } },
    recibidoPor: { select: { id: true, nombre: true, email: true, rol: true } },
    detalles: { orderBy: { id: 'asc' as const } },
    abonos: { include: { metodoPago: true }, orderBy: { fecha: 'desc' as const } },
    cuentaPorPagar: true,
    proyecto: { select: { id: true, nombre: true } },
  };

  async findAllOrdenes(options?: {
    page?: number;
    limit?: number;
    search?: string;
    estado?: string;
    estados?: string[];
    estadoPago?: string;
    proveedorId?: string;
    creadorRol?: string;
    creadorId?: string;
    pendienteRecepcion?: boolean;
    proyectoId?: string;
  }): Promise<{ items: OrdenCompraData[]; total: number }> {
    const {
      page = 1,
      limit = 10,
      search,
      estado,
      estados,
      estadoPago,
      proveedorId,
      creadorRol,
      creadorId,
      pendienteRecepcion,
      proyectoId,
    } = options || {};

    const where: any = { estado: { not: 'anulada' } };
    if (proyectoId) {
      where.proyectoId = proyectoId;
    }
    if (proveedorId) {
      where.proveedorId = proveedorId;
    }
    if (pendienteRecepcion) {
      where.estado = { in: ['aprobada', 'parcialmente_recibida'] };
    } else if (estados?.length) {
      where.estado = { in: estados };
    } else if (estado) {
      where.estado = estado;
    }
    if (estadoPago) where.estadoPago = estadoPago;
    if (creadorId) where.usuarioId = creadorId;
    if (creadorRol) {
      const lowerRol = creadorRol.toLowerCase();
      if (lowerRol === 'impresion' || lowerRol === 'impresión') {
        where.usuario = {
          rol: {
            in: ['Impresión', 'impresion', 'IMPRESIÓN', 'IMPRESION'],
          }
        };
      } else {
        where.usuario = {
          rol: {
            equals: creadorRol,
            mode: 'insensitive'
          }
        };
      }
    }
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
    const orderBy = estado === 'recibida'
      ? [{ fechaRecepcion: 'desc' as const }, { fechaCreacion: 'desc' as const }]
      : pendienteRecepcion
        ? [{ fechaAprobacion: 'desc' as const }, { fechaCreacion: 'desc' as const }]
        : { fechaCreacion: 'desc' as const };

    const [rows, total] = await Promise.all([
      this.prisma.ordenCompra.findMany({
        where,
        include: this.ordenInclude,
        orderBy,
        skip,
        take: limit,
      }),
      this.prisma.ordenCompra.count({ where }),
    ]);

    const items = await this.attachDetallesToOrdenes(rows);

    return {
      items: items as unknown as OrdenCompraData[],
      total,
    };
  }

  private async loadDetallesForOrdenIds(ordenIds: string[]) {
    if (!ordenIds.length) return new Map<string, DetalleCompraData[]>();
    const detalles = await this.prisma.detalleCompra.findMany({
      where: { ordenCompraId: { in: ordenIds } },
      include: {
        material: { select: { id: true, nombre: true, codigo: true, categoria: true, subtipo: true, descargaStock: true } },
      },
      orderBy: { id: 'asc' },
    });
    const byOrden = new Map<string, DetalleCompraData[]>();
    for (const detalle of detalles) {
      const ordenId = detalle.ordenCompraId;
      const list = byOrden.get(ordenId) || [];
      list.push(detalle as unknown as DetalleCompraData);
      byOrden.set(ordenId, list);
    }
    return byOrden;
  }

  private async attachDetallesToOrdenes<T extends { id: string }>(rows: T[]): Promise<(T & { detalles: DetalleCompraData[] })[]> {
    const byOrden = await this.loadDetallesForOrdenIds(rows.map((r) => r.id));
    return rows.map((row) => ({
      ...row,
      detalles: byOrden.get(row.id) || [],
    }));
  }

  async findOrdenById(id: string): Promise<OrdenCompraData | null> {
    const row = await this.prisma.ordenCompra.findUnique({
      where: { id },
      include: this.ordenInclude,
    });
    if (!row) return null;

    const byOrden = await this.loadDetallesForOrdenIds([id]);
    const detalles = byOrden.get(id) || [];

    return {
      ...row,
      detalles,
    } as unknown as OrdenCompraData;
  }

  async findDetallesByOrdenId(ordenId: string): Promise<DetalleCompraData[]> {
    const byOrden = await this.loadDetallesForOrdenIds([ordenId]);
    return byOrden.get(ordenId) || [];
  }

  async restoreDetallesIfEmpty(
    ordenId: string,
    detalles: DetalleCompraInput[],
  ): Promise<OrdenCompraData> {
    const existing = await this.prisma.detalleCompra.count({
      where: { ordenCompraId: ordenId },
    });
    if (existing > 0) {
      const orden = await this.findOrdenById(ordenId);
      if (!orden) throw new Error('Orden de compra no encontrada.');
      return orden;
    }

    if (!detalles?.length) {
      throw new Error('No hay detalles para restaurar.');
    }

    const detallesRows = detalles.map((d) => {
      const precioUnitario = d.precioUnitario ?? 0;
      const cantidad = d.cantidad;
      return {
        ordenCompraId: ordenId,
        descripcion: d.descripcion,
        cantidad,
        precioUnitario,
        subtotal: cantidad * precioUnitario,
        materialId: d.materialId || null,
      };
    });

    await this.prisma.detalleCompra.createMany({ data: detallesRows });

    const subtotal = detallesRows.reduce((sum, d) => sum + d.subtotal, 0);
    const ordenActual = await this.prisma.ordenCompra.findUnique({
      where: { id: ordenId },
      select: { impuesto: true },
    });
    const impuesto = ordenActual?.impuesto ?? 0;

    await this.prisma.ordenCompra.update({
      where: { id: ordenId },
      data: {
        subtotal,
        total: subtotal + impuesto,
      },
    });

    const restored = await this.findOrdenById(ordenId);
    if (!restored) throw new Error('Orden de compra no encontrada.');
    return restored;
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
    proveedorId?: string;
    usuarioId: string;
    fecha?: Date;
    impuesto?: number;
    concepto?: string;
    notas?: string;
    detalles: DetalleCompraInput[];
    fechaVencimiento?: Date | null;
    proyectoId?: string | null;
  }): Promise<OrdenCompraData> {
    const numero = await this.getNextOrdenNumero();

    // Mapear detalles - PRECIOS OPCIONALES
    const detallesData = (data.detalles || []).map(d => ({
      descripcion: d.descripcion,
      cantidad: d.cantidad,
      precioUnitario: d.precioUnitario ?? 0, // Default 0 si no se proporciona
      subtotal: d.cantidad * (d.precioUnitario ?? 0),
      materialId: d.materialId || null,
    }));

    const subtotal = detallesData.reduce((sum, d) => sum + d.subtotal, 0);
    const impuesto = data.impuesto || 0;
    const total = subtotal + impuesto;

    // Construir data object - PROVEEDOR OPCIONAL
    const createData: any = {
      numero,
      usuario: { connect: { id: data.usuarioId } },
      fecha: data.fecha ? new Date(data.fecha) : new Date(),
      subtotal,
      impuesto,
      total,
      concepto: data.concepto || '',
      notas: data.notas || '',
      estado: 'pendiente_aprobacion', // Estado inicial
      detalles: {
        create: detallesData.map(d => ({
          descripcion: d.descripcion,
          cantidad: d.cantidad,
          precioUnitario: d.precioUnitario,
          subtotal: d.subtotal,
          materialId: d.materialId,
        })),
      },
    };

    // Solo agregar proyecto si se proporciona
    if (data.proyectoId) {
      createData.proyecto = { connect: { id: data.proyectoId } };
    }

    // Solo agregar proveedor si se proporciona Y no es vacío
    if (data.proveedorId && data.proveedorId.trim() !== '') {
      createData.proveedor = { connect: { id: data.proveedorId } };
    }

    // Solo crear cuenta por pagar si hay valores
    if (total > 0) {
      createData.cuentaPorPagar = {
        create: {
          montoTotal: total,
          montoPagado: 0,
          saldo: total,
          estado: 'pendiente',
          fechaVencimiento: data.fechaVencimiento ? new Date(data.fechaVencimiento) : null,
        },
      };
    }

    const row = await this.prisma.ordenCompra.create({
      data: createData,
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
          createdBy: usuario?.nombre || 'Usuario desconocido',
        },
      });

      // Push solo a administradores
      const adminUsers = await this.prisma.user.findMany({
        where: {
          rol: { in: ['admin', 'administrador', 'Admin', 'Administrador'] },
        },
        include: {
          pushSubscriptions: true,
        },
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

  async updateOrden(id: string, data: Parameters<ComprasRepositoryPort['updateOrden']>[1]): Promise<OrdenCompraData> {
    const result = await this.prisma.$transaction(async tx => {
      await lockOrder(tx, id);
      const previous = await tx.ordenCompra.findUniqueOrThrow({ where: { id }, select: { estado: true } });
      if (previous.estado === 'anulada') throw new Error('Una orden anulada no puede editarse.');
      const order = await new PrismaComprasAdapter(tx as unknown as PrismaClient).updateOrdenData(id, data);
      return { order, previous };
    }, { timeout: 15000 });
    await this.notifyOrderApproval(result.order, data, result.previous.estado);
    return result.order;
  }

  private async updateOrdenData(id: string, data: {
    proveedorId?: string | null;
    fecha?: Date;
    impuesto?: number;
    estado?: string;
    concepto?: string;
    notas?: string;
    detalles?: DetalleCompraInput[];
    aprobadoPorId?: string;
    proyectoId?: string | null;
    abonoMonto?: number;
    metodoPagoId?: string;
    abonoReferencia?: string;
    registrarAbonoAjuste?: boolean;
    registradoPorUserId?: string | null;
    fechaRecepcion?: Date;
    notasRecepcion?: string;
    recibidoPorId?: string;
  }): Promise<OrdenCompraData> {
    const ordenAnterior = await this.prisma.ordenCompra.findUnique({
      where: { id },
      select: { estado: true, usuarioId: true },
    });

    const updateData: any = {};
    
    // Solo actualizar proveedor si se proporciona
    if (data.proveedorId !== undefined) {
      if (data.proveedorId && data.proveedorId.trim() !== '') {
        updateData.proveedor = { connect: { id: data.proveedorId } };
      } else {
        updateData.proveedor = { disconnect: true };
      }
    }
    
    if (data.fecha) updateData.fecha = new Date(data.fecha);
    
    if (data.estado) {
      updateData.estado = data.estado;
      // Si se está aprobando la orden y viene el usuario aprobador, establecer fecha y usuario
      if (data.estado === 'aprobada' && data.aprobadoPorId) {
        updateData.fechaAprobacion = new Date();
        updateData.aprobadoPor = { connect: { id: data.aprobadoPorId } };
      }
      // Si se está rechazando también poner fecha
      if (data.estado === 'rechazada') {
        updateData.fechaAprobacion = new Date();
      }
    }
    
    if (data.concepto !== undefined) updateData.concepto = data.concepto;
    if (data.notas !== undefined) updateData.notas = data.notas;
    if (data.fechaRecepcion) updateData.fechaRecepcion = new Date(data.fechaRecepcion);
    if (data.notasRecepcion !== undefined) updateData.notasRecepcion = data.notasRecepcion;
    if (data.recibidoPorId) updateData.recibidoPorId = data.recibidoPorId;
    if (data.proyectoId !== undefined) {
      if (data.proyectoId) {
        updateData.proyecto = { connect: { id: data.proyectoId } };
      } else {
        updateData.proyecto = { disconnect: true };
      }
    }

    // Recalcular o determinar el total actual
    let total = 0;
    let detailsChanged = false;

    if (data.detalles) {
      if (data.detalles.length === 0) {
        throw new Error('La orden debe conservar al menos un item.');
      }
      detailsChanged = true;
      // Recalculate totals
      const detallesData = data.detalles.map(d => ({
        descripcion: d.descripcion,
        cantidad: d.cantidad,
        precioUnitario: d.precioUnitario ?? 0,
        subtotal: d.cantidad * (d.precioUnitario ?? 0),
        materialId: d.materialId || undefined,
      }));

      const subtotal = detallesData.reduce((sum, d) => sum + d.subtotal, 0);
      const ordenActual = await this.prisma.ordenCompra.findUnique({
        where: { id },
        select: { impuesto: true },
      });
      const impuesto = data.impuesto !== undefined
        ? data.impuesto
        : Number(ordenActual?.impuesto ?? 0);
      total = subtotal + impuesto;

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
    } else if (data.impuesto !== undefined) {
      const existing = await this.prisma.ordenCompra.findUnique({
        where: { id },
        select: { subtotal: true },
      });
      if (existing) {
        updateData.impuesto = data.impuesto;
        total = existing.subtotal + data.impuesto;
        updateData.total = total;
        detailsChanged = true;
      }
    } else {
      const existing = await this.prisma.ordenCompra.findUnique({
        where: { id },
        select: { total: true },
      });
      if (existing) {
        total = existing.total;
      }
    }

    // Cuentas por Pagar (CxP) y Abonos (AbonoCompra)
    const cxp = await this.prisma.cuentaPorPagar.findUnique({
      where: { ordenCompraId: id },
    });

    const esNuevaAprobacion =
      data.estado === 'aprobada' && ordenAnterior?.estado !== 'aprobada';
    const abonoMonto = (data.registrarAbonoAjuste === true || esNuevaAprobacion)
      ? (Number(data.abonoMonto) || 0)
      : 0;
    if (abonoMonto > 0 && data.metodoPagoId) {
      // Registrar el abono
      await this.prisma.abonoCompra.create({
        data: {
          ordenCompraId: id,
          metodoPagoId: data.metodoPagoId,
          monto: abonoMonto,
          referencia: data.abonoReferencia || null,
          registradoPorUserId: data.registradoPorUserId ?? undefined,
        }
      });

      const currentMontoPagado = cxp ? cxp.montoPagado : 0;
      const newMontoPagado = currentMontoPagado + abonoMonto;
      const newSaldo = total - newMontoPagado;
      const newEstado = newSaldo <= 0 ? 'pagado' : 'parcial';

      updateData.estadoPago = newEstado;

      if (cxp) {
        await this.prisma.cuentaPorPagar.update({
          where: { id: cxp.id },
          data: {
            montoTotal: total,
            montoPagado: newMontoPagado,
            saldo: Math.max(0, newSaldo),
            estado: newEstado,
          },
        });
      } else {
        updateData.cuentaPorPagar = {
          create: {
            montoTotal: total,
            montoPagado: abonoMonto,
            saldo: Math.max(0, total - abonoMonto),
            estado: abonoMonto >= total ? 'pagado' : 'parcial',
          },
        };
      }
    } else {
      // Sin abono nuevo, pero si cambiaron los detalles o el impuesto, actualizar el montoTotal y saldo
      if (detailsChanged && total > 0) {
        if (cxp) {
          const newSaldo = total - cxp.montoPagado;
          const newEstado = newSaldo <= 0 ? 'pagado' : cxp.montoPagado > 0 ? 'parcial' : 'pendiente';
          updateData.estadoPago = newEstado === 'pendiente' ? 'sin_pagar' : newEstado;

          await this.prisma.cuentaPorPagar.update({
            where: { id: cxp.id },
            data: {
              montoTotal: total,
              saldo: Math.max(0, newSaldo),
              estado: newEstado,
            },
          });
        } else {
          updateData.cuentaPorPagar = {
            create: {
              montoTotal: total,
              montoPagado: 0,
              saldo: total,
              estado: 'pendiente',
            },
          };
          updateData.estadoPago = 'sin_pagar';
        }
      }
    }

    const row = await this.prisma.ordenCompra.update({
      where: { id },
      data: updateData,
      include: this.ordenInclude,
    });

    const byOrden = await this.loadDetallesForOrdenIds([id]);
    const detallesActualizados = byOrden.get(id) || (row as { detalles?: DetalleCompraData[] }).detalles || [];

    const ordenActualizada = {
      ...row,
      detalles: detallesActualizados,
    };

    // Registrar gasto automáticamente si fue aprobada y está ligada a un proyecto (Deshabilitado en Costeo por Consumo)
    /*
    if (data.estado === 'aprobada' && row.proyectoId) {
      try {
        const provName = (row as any).proveedor?.nombre || 'Sin proveedor específico';
        await this.prisma.gasto.create({
          data: {
            id: `G-OC-${row.id.slice(-8)}-${Date.now()}`,
            concepto: `Materiales de Orden de Compra - ${row.numero}`,
            categoria: 'proyecto',
            fecha: new Date(),
            monto: row.total,
            proveedor: provName,
            proyectoId: row.proyectoId,
            notas: row.id, // Guardar el ID de la OC para recuperarla desde el frontend
          }
        });
        console.log(`[Gasto Automático] Creado gasto de $${row.total} para proyecto ${row.proyectoId} desde OC ${row.numero}`);
      } catch (err) {
        console.error('[Gasto Automático Error] No se pudo crear el gasto para el proyecto:', err);
      }
    }
    */

    return ordenActualizada as unknown as OrdenCompraData;
  }

  private async notifyOrderApproval(ordenActualizada: OrdenCompraData, data: Parameters<ComprasRepositoryPort['updateOrden']>[1], previousState: string) {
    const row = ordenActualizada;
    const ordenAnterior = { estado: previousState };
    // Notificar al creador solo en la transición a aprobada (con o sin proyecto)
    const pasoAAprobada = data.estado === 'aprobada' && ordenAnterior?.estado !== 'aprobada';
    if (pasoAAprobada) {
      try {
        const aprobador = data.aprobadoPorId
          ? await this.prisma.user.findUnique({
              where: { id: data.aprobadoPorId },
              select: { nombre: true },
            })
          : (ordenActualizada as any).aprobadoPor;

        const aprobadorNombre = aprobador?.nombre || 'Administración';

        // Obtener el creador para conocer su rol
        const creador = await this.prisma.user.findUnique({
          where: { id: row.usuarioId },
          select: { id: true, nombre: true, rol: true },
        });

        const creadorRol = creador?.rol || '';
        const creadorRolLower = creadorRol.toLowerCase();

        // 1. Notificación directa al usuario creador
        const notif = await this.prisma.notification.create({
          data: {
            title: 'Orden de Compra Aprobada',
            message: `La orden de compra ${row.numero} ha sido aprobada por ${aprobadorNombre}.`,
            userId: row.usuarioId,
            createdBy: aprobadorNombre,
          },
        });

        // 2. Notificación al ROL del creador (para que su departamento se entere)
        if (creadorRol && creadorRolLower !== 'admin' && creadorRolLower !== 'administrador') {
          await this.prisma.notification.create({
            data: {
              title: 'Orden de Compra Aprobada',
              message: `La orden de compra ${row.numero} (solicitada por ${creador?.nombre || 'usuario'}) ha sido aprobada por ${aprobadorNombre}.`,
              userId: null,
              rol: creadorRol,
              createdBy: aprobadorNombre,
            },
          });
        }

        console.log(`[Notification] Aprobación OC ${row.numero} → usuario ${row.usuarioId} y rol ${creadorRol}`);

        // 3. Web Push Notifications
        const rolesForPush = [];
        if (creadorRol) rolesForPush.push(creadorRol);
        
        if (creadorRolLower === 'impresión' || creadorRolLower === 'impresion') {
           rolesForPush.push('impresión', 'impresion', 'IMPRESIÓN', 'IMPRESION');
        } else if (creadorRolLower === 'taller') {
           rolesForPush.push('taller', 'Taller', 'TALLER');
        } else if (creadorRolLower === 'ventas' || creadorRolLower === 'diseñador' || creadorRolLower === 'disenador') {
           rolesForPush.push('ventas', 'Ventas', 'diseñador', 'Diseñador', 'DISEÑADOR');
        }

        const usersToNotify = await this.prisma.user.findMany({
          where: {
            OR: [
              { id: row.usuarioId },
              rolesForPush.length > 0 ? { rol: { in: rolesForPush } } : { id: 'no-match' },
            ],
          },
          include: { pushSubscriptions: true },
        });

        const pushPayload = JSON.stringify({
          title: notif.title,
          body: notif.message,
          url: '/compras/recepcion',
        });

        for (const user of usersToNotify) {
          for (const sub of user.pushSubscriptions) {
            try {
              const subscriptionParams = {
                endpoint: sub.endpoint,
                keys: {
                  p256dh: sub.p256dh,
                  auth: sub.auth,
                },
              };
              await webpush.sendNotification(subscriptionParams, pushPayload);
            } catch (pushErr: any) {
              console.error(`[Web Push Error] Failed to send to endpoint ${sub.endpoint}:`, pushErr.message);
              if (pushErr.statusCode === 404 || pushErr.statusCode === 410) {
                await this.prisma.pushSubscription.delete({ where: { endpoint: sub.endpoint } });
              }
            }
          }
        }
      } catch (err) {
        console.error('[Notification Approval Error]', err);
      }
    }

  }

  async updateDetalleRecepcion(id: string, data: {
    cantidadRecibida: number;
    descargableInventario: boolean;
    fechaRecepcion?: Date;
  }): Promise<void> {
    await this.prisma.detalleCompra.update({
      where: { id },
      data: {
        cantidadRecibida: data.cantidadRecibida,
        descargableInventario: data.descargableInventario,
        ...(data.fechaRecepcion ? { fechaRecepcion: data.fechaRecepcion } : {}),
      },
    });
  }

  // ── Abonos ─────────────────────────────────────────────────────────────────

  async findAbonosByOrden(ordenId: string): Promise<AbonoCompraData[]> {
    const rows = await this.prisma.abonoCompra.findMany({
      where: { ordenCompraId: ordenId },
      include: {
        metodoPago: true,
        registradoPor: { select: { id: true, nombre: true } },
      },
      orderBy: { fecha: 'desc' },
    });
    return rows as unknown as AbonoCompraData[];
  }

  async createAbono(data: {
    ordenCompraId: string;
    metodoPagoId: string;
    monto: number;
    referencia?: string;
    registradoPorUserId?: string | null;
  }): Promise<AbonoCompraData> {
    return this.prisma.$transaction(async tx => {
      await lockOrder(tx, data.ordenCompraId);
      return addPurchasePayment(tx, data);
    }) as Promise<AbonoCompraData>;
  }

  async deleteAbono(abonoId: string, ordenCompraId: string, monto: number): Promise<void> {
    await this.prisma.$transaction(async tx => {
      await lockOrder(tx, ordenCompraId);
      const order = await tx.ordenCompra.findUniqueOrThrow({ where: { id: ordenCompraId } });
      if (order.estado === 'anulada') throw new Error('Los pagos de una orden anulada conservan su historial.');
      await tx.abonoCompra.delete({ where: { id: abonoId, ordenCompraId } });
      await syncPurchaseBalance(tx, ordenCompraId);
    });
  }

  // ── Cheques Posfechados ───────────────────────────────────────────────────

  async createChequeCompra(input: {
    ordenCompraId: string;
    metodoPagoId: string;
    numeroCheque: string;
    monto: number;
    fechaCobro: Date;
    referencia?: string;
    registradoPorUserId?: string;
  }): Promise<any> {
    const row = await this.prisma.$transaction(async tx => {
      await lockOrder(tx, input.ordenCompraId);
      const order = await tx.ordenCompra.findUniqueOrThrow({ where: { id: input.ordenCompraId } });
      if (order.estado === 'anulada') throw new Error('No se pueden emitir cheques para una orden anulada.');
    const row = await tx.chequeCompra.create({
      data: {
        ordenCompraId: input.ordenCompraId,
        metodoPagoId: input.metodoPagoId,
        numeroCheque: input.numeroCheque,
        monto: input.monto,
        fechaCobro: input.fechaCobro,
        referencia: input.referencia || `Cheque N° ${input.numeroCheque}`,
        registradoPorUserId: input.registradoPorUserId || null,
        estado: 'PENDIENTE',
        procesado: false,
        notificado: false,
      },
      include: {
        ordenCompra: { include: { proveedor: true } },
        metodoPago: true,
        registradoPor: { select: { id: true, nombre: true } },
      },
    });

      return row;
    });

    // Activar el worker inmediatamente por si la fecha asignada ya venció/hoy
    procesarChequesVencidos().catch(err => console.error('[Cheque Worker Error]', err));

    return row;
  }

  async findAllChequesCompra(options?: { estado?: string; ordenCompraId?: string }): Promise<any[]> {
    const where: any = {};
    if (options?.estado) where.estado = options.estado;
    if (options?.ordenCompraId) where.ordenCompraId = options.ordenCompraId;

    const rows = await (this.prisma as any).chequeCompra.findMany({
      where,
      include: {
        ordenCompra: { include: { proveedor: true } },
        metodoPago: true,
        registradoPor: { select: { id: true, nombre: true } },
      },
      orderBy: { fechaCobro: 'asc' },
    });
    return rows;
  }

  async procesarChequeCompra(id: string): Promise<any> {
    return processPurchaseCheque(this.prisma, id);
  }

  async updateChequeCompra(id: string, data: { numeroCheque?: string; fechaCobro?: Date; monto?: number; metodoPagoId?: string }): Promise<any> {
    const ref = await this.prisma.chequeCompra.findUniqueOrThrow({ where: { id } });
    const updated = await this.prisma.$transaction(async tx => {
      await lockOrder(tx, ref.ordenCompraId);
      const cheque = await tx.chequeCompra.findUniqueOrThrow({ where: { id }, include: { ordenCompra: true } });
      if (cheque.procesado || cheque.estado !== 'PENDIENTE' || cheque.ordenCompra.estado === 'anulada') throw new Error('Solo se pueden editar cheques pendientes de órdenes vigentes.');
      if (data.monto !== undefined && (!Number.isFinite(data.monto) || data.monto <= 0)) throw new Error('El monto debe ser mayor a cero.');
      return tx.chequeCompra.update({ where: { id }, data, include: {
        ordenCompra: { include: { proveedor: true } }, metodoPago: true,
        registradoPor: { select: { id: true, nombre: true } },
      } });
    });

    procesarChequesVencidos().catch(err => console.error('[Cheque Worker Error]', err));

    return updated;
  }

  async deleteChequeCompra(id: string): Promise<void> {
    const ref = await this.prisma.chequeCompra.findUniqueOrThrow({ where: { id } });
    await this.prisma.$transaction(async tx => {
      await lockOrder(tx, ref.ordenCompraId);
      const cheque = await tx.chequeCompra.findUniqueOrThrow({ where: { id }, include: { ordenCompra: true } });
      if (cheque.procesado || cheque.estado !== 'PENDIENTE' || cheque.ordenCompra.estado === 'anulada') throw new Error('Los cheques procesados o anulados conservan su historial.');
      await tx.chequeCompra.delete({ where: { id } });
    });
  }

  // ── Cuentas por Pagar ──────────────────────────────────────────────────────

  async findAllCuentasPorPagar(options?: {
    page?: number;
    limit?: number;
    estado?: string;
  }): Promise<{ items: CuentaPorPagarData[]; total: number }> {
    // Evaluar inmediatamente si hay cheques vencidos pendientes antes de retornar la lista
    await procesarChequesVencidos().catch(err => console.error('[Cheque Auto-Check Error]', err));

    const { page = 1, limit = 10, estado } = options || {};

    const where: any = { estado: { not: 'anulada' } };
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

  async createCuentaPorPagarManual(input: CreateCuentaPorPagarManualInput): Promise<CuentaPorPagarData> {
    const {
      usuarioId,
      proveedorId,
      proveedorNombreManual,
      concepto,
      montoTotal,
      fechaEmision,
      fechaVencimiento,
      proyectoId,
      notas,
      abonoInicial,
    } = input;

    // 1. Obtener o crear proveedor si es nombre manual
    let finalProveedorId = proveedorId && proveedorId.trim() !== '' ? proveedorId : null;
    if (!finalProveedorId && proveedorNombreManual && proveedorNombreManual.trim() !== '') {
      const existing = await this.prisma.proveedor.findFirst({
        where: { nombre: { equals: proveedorNombreManual.trim(), mode: 'insensitive' } },
      });
      if (existing) {
        finalProveedorId = existing.id;
      } else {
        const newProv = await this.prisma.proveedor.create({
          data: {
            nombre: proveedorNombreManual.trim(),
            estado: 'activo',
          },
        });
        finalProveedorId = newProv.id;
      }
    }

    // 2. Generar número de orden manual
    const countManual = await this.prisma.ordenCompra.count({
      where: { numero: { startsWith: 'ORC_MAN_' } },
    });
    const numero = `ORC_MAN_${String(countManual + 1).padStart(3, '0')}`;

    const fechaEmisionDate = fechaEmision ? new Date(fechaEmision) : new Date();
    const fechaVencimientoDate = fechaVencimiento ? new Date(fechaVencimiento) : null;

    const abonoMonto = (abonoInicial && Number(abonoInicial.monto) > 0) ? Number(abonoInicial.monto) : 0;
    const initialSaldo = Math.max(0, montoTotal - abonoMonto);
    const initialEstado = initialSaldo <= 0 ? 'pagado' : abonoMonto > 0 ? 'parcial' : 'pendiente';
    const estadoPagoOrden = initialEstado === 'pendiente' ? 'sin_pagar' : initialEstado;

    // 3. Crear OrdenCompra + DetalleCompra + CuentaPorPagar
    const orden = await this.prisma.ordenCompra.create({
      data: {
        numero,
        usuarioId,
        proveedorId: finalProveedorId,
        fecha: fechaEmisionDate,
        subtotal: montoTotal,
        impuesto: 0,
        total: montoTotal,
        concepto: concepto || 'Cuenta por pagar manual',
        notas: notas || null,
        estado: 'aprobada',
        estadoPago: estadoPagoOrden,
        proyectoId: proyectoId || null,
        detalles: {
          create: [
            {
              descripcion: concepto || 'Cuenta por pagar manual',
              cantidad: 1,
              precioUnitario: montoTotal,
              subtotal: montoTotal,
            },
          ],
        },
        cuentaPorPagar: {
          create: {
            montoTotal,
            montoPagado: abonoMonto,
            saldo: initialSaldo,
            fechaVencimiento: fechaVencimientoDate,
            estado: initialEstado,
          },
        },
      },
      include: {
        cuentaPorPagar: true,
        proveedor: true,
      },
    });

    // 4. Registrar Abono / Cheque si se especificó abonoInicial
    if (abonoMonto > 0 && abonoInicial?.metodoPagoId) {
      await this.prisma.abonoCompra.create({
        data: {
          ordenCompraId: orden.id,
          metodoPagoId: abonoInicial.metodoPagoId,
          monto: abonoMonto,
          referencia: abonoInicial.referencia || 'Abono inicial al registrar cuenta',
          registradoPorUserId: usuarioId,
        },
      });

      if (abonoInicial.esChequePosfechado && abonoInicial.numeroCheque && abonoInicial.fechaCobro) {
        await this.prisma.chequeCompra.create({
          data: {
            ordenCompraId: orden.id,
            metodoPagoId: abonoInicial.metodoPagoId,
            numeroCheque: abonoInicial.numeroCheque,
            monto: abonoMonto,
            fechaCobro: new Date(abonoInicial.fechaCobro),
            referencia: abonoInicial.referencia || null,
            registradoPorUserId: usuarioId,
            estado: 'PENDIENTE',
          },
        });
      }
    }

    const createdCxP = await this.prisma.cuentaPorPagar.findUnique({
      where: { id: orden.cuentaPorPagar!.id },
      include: { ordenCompra: { include: { proveedor: true } } },
    });

    return createdCxP as unknown as CuentaPorPagarData;
  }

  // ── Métodos de Pago ────────────────────────────────────────────────────────

  async findAllMetodosPago(desde?: Date, hasta?: Date): Promise<MetodoPagoData[]> {
    const metodos = await this.prisma.metodoPago.findMany({
      orderBy: { nombre: 'asc' },
    });

    // 1. Fetch aggregates for all-time transactions grouped by metodoPagoId
    const abonosProformaAllTime = await this.prisma.abonoProforma.groupBy({
      by: ['metodoPagoId'],
      _sum: { monto: true }
    } as any);

    const gastosAllTime = await this.prisma.gasto.groupBy({
      by: ['metodoPagoId'],
      _sum: { monto: true }
    } as any);

    const abonosCompraAllTime = await this.prisma.abonoCompra.groupBy({
      by: ['metodoPagoId'],
      _sum: { monto: true }
    } as any);

    const ingresosAllTime = await this.prisma.ingreso.groupBy({
      by: ['metodoPagoId'],
      _sum: { monto: true }
    } as any);

    const transEnviadasAllTime = await this.prisma.transferencia.groupBy({
      by: ['origenMetodoId'],
      _sum: { monto: true }
    } as any);

    const transRecibidasAllTime = await this.prisma.transferencia.groupBy({
      by: ['destinoMetodoId'],
      _sum: { monto: true }
    } as any);

    // 2. Fetch period-specific aggregates if dates are provided
    let abonosProformaPeriod: any[] = [];
    let gastosPeriod: any[] = [];
    let abonosCompraPeriod: any[] = [];
    let ingresosPeriod: any[] = [];
    let transEnviadasPeriod: any[] = [];
    let transRecibidasPeriod: any[] = [];

    if (desde && hasta) {
      abonosProformaPeriod = await this.prisma.abonoProforma.groupBy({
        by: ['metodoPagoId'],
        _sum: { monto: true },
        where: { fecha: { gte: desde, lte: hasta } }
      } as any);

      gastosPeriod = await this.prisma.gasto.groupBy({
        by: ['metodoPagoId'],
        _sum: { monto: true },
        where: { fecha: { gte: desde, lte: hasta } }
      } as any);

      abonosCompraPeriod = await this.prisma.abonoCompra.groupBy({
        by: ['metodoPagoId'],
        _sum: { monto: true },
        where: { fecha: { gte: desde, lte: hasta } }
      } as any);

      ingresosPeriod = await this.prisma.ingreso.groupBy({
        by: ['metodoPagoId'],
        _sum: { monto: true },
        where: { fecha: { gte: desde, lte: hasta } }
      } as any);

      transEnviadasPeriod = await this.prisma.transferencia.groupBy({
        by: ['origenMetodoId'],
        _sum: { monto: true },
        where: { fecha: { gte: desde, lte: hasta } }
      } as any);

      transRecibidasPeriod = await this.prisma.transferencia.groupBy({
        by: ['destinoMetodoId'],
        _sum: { monto: true },
        where: { fecha: { gte: desde, lte: hasta } }
      } as any);
    }

    const mapById = (arr: any[], key = 'metodoPagoId') => {
      const map: Record<string, number> = {};
      for (const item of arr) {
        const id = item[key];
        if (id) {
          map[id] = Number(item._sum.monto || 0);
        }
      }
      return map;
    };

    const ingAllTimeMap = mapById(abonosProformaAllTime);
    const ingManualAllTimeMap = mapById(ingresosAllTime);
    const transEnviadasAllTimeMap = mapById(transEnviadasAllTime, 'origenMetodoId');
    const transRecibidasAllTimeMap = mapById(transRecibidasAllTime, 'destinoMetodoId');
    const gasAllTimeMap = mapById(gastosAllTime);
    const egrAllTimeMap = mapById(abonosCompraAllTime);

    const ingPeriodMap = (desde && hasta) ? mapById(abonosProformaPeriod) : ingAllTimeMap;
    const ingManualPeriodMap = (desde && hasta) ? mapById(ingresosPeriod) : ingManualAllTimeMap;
    const transEnviadasPeriodMap = (desde && hasta) ? mapById(transEnviadasPeriod, 'origenMetodoId') : transEnviadasAllTimeMap;
    const transRecibidasPeriodMap = (desde && hasta) ? mapById(transRecibidasPeriod, 'destinoMetodoId') : transRecibidasAllTimeMap;
    const gasPeriodMap = (desde && hasta) ? mapById(gastosPeriod) : gasAllTimeMap;
    const egrPeriodMap = (desde && hasta) ? mapById(abonosCompraPeriod) : egrAllTimeMap;

    return metodos.map(m => {
      const ingAllTime = (ingAllTimeMap[m.id] || 0) + (ingManualAllTimeMap[m.id] || 0) + (transRecibidasAllTimeMap[m.id] || 0);
      const gasAllTime = gasAllTimeMap[m.id] || 0;
      const egrAllTime = egrAllTimeMap[m.id] || 0;
      const transEnviadasAllTime = transEnviadasAllTimeMap[m.id] || 0;
      const saldoActual = ingAllTime - (gasAllTime + egrAllTime + transEnviadasAllTime);

      const ingPeriod = (ingPeriodMap[m.id] || 0) + (ingManualPeriodMap[m.id] || 0) + (transRecibidasPeriodMap[m.id] || 0);
      const gasPeriod = gasPeriodMap[m.id] || 0;
      const egrPeriod = egrPeriodMap[m.id] || 0;
      const transEnviadasPeriod = transEnviadasPeriodMap[m.id] || 0;
      const egresosPeriod = gasPeriod + egrPeriod + transEnviadasPeriod;

      return {
        id: m.id,
        nombre: m.nombre,
        descripcion: m.descripcion,
        activo: m.activo,
        tipo: m.tipo,
        saldoActual,
        ingresosPeriod: ingPeriod,
        egresosPeriod: egresosPeriod,
        netoPeriod: ingPeriod - egresosPeriod,
      } as unknown as MetodoPagoData;
    });
  }

  async createMetodoPago(data: { nombre: string; descripcion?: string; tipo?: string }): Promise<MetodoPagoData> {
    const row = await this.prisma.metodoPago.create({ data });
    return row as unknown as MetodoPagoData;
  }

  async updateMetodoPago(id: string, data: { nombre?: string; descripcion?: string; activo?: boolean; tipo?: string }): Promise<MetodoPagoData> {
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
      this.prisma.ordenCompra.count({ where: { estado: { not: 'anulada' } } }),
      this.prisma.ordenCompra.count({ where: { estado: 'pendiente_aprobacion' } }),
      this.prisma.ordenCompra.aggregate({ _sum: { total: true }, where: { estado: { not: 'anulada' } } }),
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

  // ── Edición con Reconciliación Financiera ──────────────────────────────────

  /** Edita en el mismo registro: conserva número, recepciones, cheques y pagos. */
  async editarOrdenConReconciliacion(
    id: string,
    data: {
      fecha?: string;
      concepto?: string;
      notas?: string;
      proyectoId?: string | null;
      impuesto: number;
      detalles: {
        id?: string;
        descripcion: string;
        cantidad: number;
        precioUnitario: number;
        materialId?: string | null;
        isCustom?: boolean;
      }[];
      editadoPorId: string;
      // Pago inicial opcional en la nueva orden
      abonoMonto?: number;
      metodoPagoId?: string | null;
      abonoReferencia?: string;
    }
  ): Promise<OrdenCompraData> {
    await this.prisma.$transaction(async tx => {
      await lockOrder(tx, id);
      const order = await tx.ordenCompra.findUniqueOrThrow({ where: { id }, include: { detalles: true, abonos: true, cheques: true, cuentaPorPagar: true } });
      if (!['pendiente_aprobacion', 'aprobada', 'parcialmente_recibida'].includes(order.estado)) throw new Error('Esta orden no admite edición.');
      const paid = order.abonos.reduce((sum, p) => sum + p.monto, 0);
      const total = data.detalles.reduce((sum, d) => sum + d.cantidad * d.precioUnitario, 0) + data.impuesto;
      const extra = data.abonoMonto || 0;
      if (!Number.isFinite(total) || total < 0 || extra < 0 || !Number.isFinite(extra) || total + 0.001 < paid + extra) throw new Error('El nuevo total no puede ser menor a los pagos. Usa la anulación para registrar un reembolso.');
      const pendingCheques = order.cheques.filter(c => c.estado === 'PENDIENTE' && !c.procesado).reduce((sum,c)=>sum+c.monto,0);
      if (pendingCheques > total - paid - extra + 0.001) throw new Error('Cancela o ajusta los cheques pendientes antes de reducir la deuda.');
      const keep = new Set(data.detalles.filter(d=>d.id).map(d=>d.id!));
      if (keep.size !== data.detalles.filter(d=>d.id).length) throw new Error('Hay ítems duplicados.');
      for (const d of order.detalles) {
        if ((d.cantidadRecibida || 0) > 0) {
          const next = data.detalles.find(n=>n.id===d.id);
          if (!next || next.cantidad !== d.cantidad || (next.materialId || null) !== d.materialId) throw new Error('Un ítem recibido conserva su material, cantidad y vínculo.');
        }
      }
      await tx.detalleCompra.deleteMany({ where: { ordenCompraId: id, id: { notIn: [...keep] } } });
      for (const d of data.detalles) {
        if (!Number.isFinite(d.cantidad) || d.cantidad <= 0 || !Number.isFinite(d.precioUnitario) || d.precioUnitario < 0) throw new Error('Cantidad o precio inválido.');
        const fields = { descripcion: d.descripcion, cantidad: d.cantidad, precioUnitario: d.precioUnitario, subtotal: d.cantidad * d.precioUnitario, materialId: d.materialId || null };
        if (d.id) {
          if (!order.detalles.some(old=>old.id===d.id)) throw new Error('El ítem no pertenece a la orden.');
          await tx.detalleCompra.update({ where: { id: d.id }, data: fields });
        } else await tx.detalleCompra.create({ data: { ...fields, ordenCompraId: id } });
      }
      await tx.ordenCompra.update({ where: { id }, data: { subtotal: total - data.impuesto, impuesto: data.impuesto, total, ...(data.fecha ? { fecha: new Date(data.fecha) } : {}), concepto: data.concepto, notas: data.notas, proyectoId: data.proyectoId } });
      await tx.cuentaPorPagar.upsert({ where: { ordenCompraId: id }, create: { ordenCompraId: id, montoTotal: total, montoPagado: paid, saldo: total - paid }, update: { montoTotal: total, saldo: total - paid } });
      await syncPurchaseBalance(tx, id);
      if (extra > 0) await addPurchasePayment(tx, { ordenCompraId: id, metodoPagoId: data.metodoPagoId!, monto: extra, referencia: data.abonoReferencia, registradoPorUserId: data.editadoPorId });
      await tx.auditLog.create({ data: { userId: data.editadoPorId, accion: 'Editar orden conservando historial', modulo: 'Compras', severidad: 'info', detalle: JSON.stringify({ ordenId: id, numero: order.numero, totalAnterior: order.total, totalNuevo: total, pagosConservados: order.abonos.map(a=>a.id) }) } });
    }, { timeout: 15000 });
    const result = await this.findOrdenById(id);
    if (!result) throw new Error('Orden no encontrada.');
    return result;
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

  async createMaterialDesdeRollo(data: {
    materialBaseId: string;
    metros: number;
    ordenNumero: string;
    userId?: string | null;
    precioCosto?: number;
  }): Promise<{ id: string; nombre: string }> {
    return this.prisma.$transaction(tx => createRoll(tx, data));
  }


  async ocultarMaterialAgotado(materialId: string): Promise<void> {
    await this.prisma.material.updateMany({
      where: {
        id: materialId,
        stockActual: { lte: 0 },
        subtipo: { in: ['consumible_descargable'] },
      },
      data: { ocultado: true },
    });
  }
}

