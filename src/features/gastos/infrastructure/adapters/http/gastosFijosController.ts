import { Request, Response } from 'express';
import { prisma } from '../../../../../config/prismaClient.js';
import { sendPushToRole } from '../../../../../shared/services/pushNotificationService.js';

function getTodayString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function calculateNextDueDate(currentDate: Date, frecuencia: string, diaVencimiento?: number | null): Date {
  const next = new Date(currentDate);
  const freq = (frecuencia || 'MENSUAL').toUpperCase();

  if (freq === 'DIARIO') {
    next.setDate(next.getDate() + 1);
  } else if (freq === 'SEMANAL') {
    next.setDate(next.getDate() + 7);
  } else if (freq === 'QUINCENAL') {
    next.setDate(next.getDate() + 15);
  } else if (freq === 'ANUAL') {
    next.setFullYear(next.getFullYear() + 1);
  } else {
    // MENSUAL por defecto
    next.setMonth(next.getMonth() + 1);
    if (diaVencimiento && diaVencimiento >= 1 && diaVencimiento <= 31) {
      const maxDays = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
      next.setDate(Math.min(diaVencimiento, maxDays));
    }
  }
  return next;
}

export async function checkAndNotifyGastosFijosVencidos(): Promise<number> {
  try {
    if (!prisma.gastoFijo) return 0;
    const todayStr = getTodayString();
    const todayDate = new Date(`${todayStr}T00:00:00.000Z`);

    const fijosVencidos = await prisma.gastoFijo.findMany({
      where: {
        activo: true,
        proximaFechaPago: { lte: todayDate },
      },
    });

    if (fijosVencidos.length === 0) return 0;

    const rolesToNotify = ['admin', 'administrador', 'ventas'];
    const title = 'Gasto Fijo por Pagar';

    for (const gf of fijosVencidos) {
      const montoFmt = Number(gf.montoEstimado).toFixed(2);
      const message = `El gasto fijo '${gf.nombre}' con valor de $${montoFmt} requiere pago (Vencimiento: ${gf.proximaFechaPago.toISOString().slice(0, 10)}).`;

      // Evitar crear notificaciones duplicadas hoy para este mismo gasto fijo
      const startOfDay = new Date(`${todayStr}T00:00:00.000Z`);
      const existingNotif = await prisma.notification.findFirst({
        where: {
          title,
          message: { contains: gf.nombre },
          createdAt: { gte: startOfDay },
        },
      });

      if (!existingNotif) {
        for (const roleName of rolesToNotify) {
          await prisma.notification.create({
            data: {
              title,
              message,
              rol: roleName.toLowerCase(),
              createdBy: 'Sistema Gastos Fijos',
            },
          });

          await sendPushToRole(roleName, {
            title,
            body: message,
            data: { url: '/gastos' },
          }).catch(() => undefined);
        }
      }
    }

    return fijosVencidos.length;
  } catch (err) {
    console.error('Error al verificar notificación de gastos fijos:', err);
    return 0;
  }
}

export class GastosFijosController {
  // Listar todos los gastos fijos
  async list(_req: Request, res: Response) {
    try {
      const todayStr = getTodayString();
      const todayDate = new Date(`${todayStr}T00:00:00.000Z`);

      // Verificar y notificar vencidos
      await checkAndNotifyGastosFijosVencidos();

      const items = await prisma.gastoFijo.findMany({
        orderBy: [{ activo: 'desc' }, { proximaFechaPago: 'asc' }],
        include: {
          metodoPago: true,
          pagos: {
            orderBy: { createdAt: 'desc' },
            include: {
              gasto: {
                include: {
                  metodoPago: true,
                  registradoPor: { select: { nombre: true, username: true } },
                },
              },
            },
          },
        },
      });

      const deudasCount = items.filter(
        (i) => i.activo && new Date(i.proximaFechaPago) <= todayDate
      ).length;

      const formatted = items.map((item) => {
        const itemDate = new Date(item.proximaFechaPago);
        const esVencido = item.activo && itemDate <= todayDate;
        const diffMs = itemDate.getTime() - todayDate.getTime();
        const diasRestantes = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

        return {
          id: item.id,
          nombre: item.nombre,
          categoria: item.categoria,
          montoEstimado: Number(item.montoEstimado),
          frecuencia: item.frecuencia,
          diaVencimiento: item.diaVencimiento,
          proximaFechaPago: item.proximaFechaPago.toISOString().slice(0, 10),
          proveedor: item.proveedor,
          notas: item.notas,
          activo: item.activo,
          metodoPagoId: item.metodoPagoId,
          metodoPagoNombre: item.metodoPago?.nombre || null,
          esVencido,
          diasRestantes,
          pagos: item.pagos.map((p) => ({
            id: p.id,
            gastoId: p.gastoId,
            montoPagado: Number(p.montoPagado),
            fechaPago: p.fechaPago.toISOString().slice(0, 10),
            createdAt: p.createdAt.toISOString(),
            periodoPagado: p.periodoPagado,
            concepto: p.gasto?.concepto || '',
            proveedor: p.gasto?.proveedor || '',
            notas: p.gasto?.notas || '',
            metodoPagoId: p.gasto?.metodoPagoId || null,
            metodoPagoNombre: p.gasto?.metodoPago?.nombre || 'Sin especificar',
            usuarioNombre: p.gasto?.registradoPor?.nombre || p.gasto?.registradoPor?.username || 'Sistema',
          })),
        };
      });


      return res.json({
        success: true,
        data: formatted,
        meta: { deudasCount },
      });
    } catch (error) {
      console.error('Error al listar gastos fijos:', error);
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'No se pudieron obtener los gastos fijos' },
      });
    }
  }

  // Conteo de deudas por pagar (badge)
  async getDeudasCount(_req: Request, res: Response) {
    try {
      const todayStr = getTodayString();
      const todayDate = new Date(`${todayStr}T00:00:00.000Z`);

      const count = await prisma.gastoFijo.count({
        where: {
          activo: true,
          proximaFechaPago: { lte: todayDate },
        },
      });

      return res.json({ success: true, count });
    } catch (error) {
      return res.status(500).json({ success: false, count: 0 });
    }
  }

  // Crear gasto fijo
  async create(req: Request, res: Response) {
    try {
      const {
        nombre,
        categoria,
        montoEstimado,
        frecuencia,
        diaVencimiento,
        proximaFechaPago,
        proveedor,
        notas,
        metodoPagoId,
      } = req.body as {
        nombre?: string;
        categoria?: string;
        montoEstimado?: number;
        frecuencia?: string;
        diaVencimiento?: number;
        proximaFechaPago?: string;
        proveedor?: string;
        notas?: string;
        metodoPagoId?: string;
      };

      if (!nombre?.trim()) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_INPUT', message: 'El nombre es obligatorio' },
        });
      }

      if (!montoEstimado || montoEstimado <= 0) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_INPUT', message: 'El monto estimado debe ser mayor a 0' },
        });
      }

      const fechaPagoDate = proximaFechaPago
        ? new Date(`${proximaFechaPago}T00:00:00.000Z`)
        : new Date();

      const nuevo = await prisma.gastoFijo.create({
        data: {
          nombre: nombre.trim(),
          categoria: categoria?.trim() || 'oficina',
          montoEstimado,
          frecuencia: (frecuencia || 'MENSUAL').toUpperCase(),
          diaVencimiento: diaVencimiento ? Number(diaVencimiento) : null,
          proximaFechaPago: fechaPagoDate,
          proveedor: proveedor?.trim() || '',
          notas: notas?.trim() || '',
          activo: true,
          metodoPagoId: metodoPagoId || null,
          registradoPorUserId: (req as any).user?.id || null,
        },
      });

      // Verificar si ya debe ser notificado
      await checkAndNotifyGastosFijosVencidos();

      return res.status(201).json({ success: true, data: nuevo });
    } catch (error) {
      console.error('Error al crear gasto fijo:', error);
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'No se pudo crear el gasto fijo' },
      });
    }
  }

  // Actualizar gasto fijo
  async update(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      const {
        nombre,
        categoria,
        montoEstimado,
        frecuencia,
        diaVencimiento,
        proximaFechaPago,
        proveedor,
        notas,
        activo,
        metodoPagoId,
      } = req.body as {
        nombre?: string;
        categoria?: string;
        montoEstimado?: number;
        frecuencia?: string;
        diaVencimiento?: number;
        proximaFechaPago?: string;
        proveedor?: string;
        notas?: string;
        activo?: boolean;
        metodoPagoId?: string;
      };

      const existing = await prisma.gastoFijo.findUnique({ where: { id } });
      if (!existing) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Gasto fijo no encontrado' },
        });
      }

      const updated = await prisma.gastoFijo.update({
        where: { id },
        data: {
          ...(nombre !== undefined && { nombre: nombre.trim() }),
          ...(categoria !== undefined && { categoria: categoria.trim() }),
          ...(montoEstimado !== undefined && { montoEstimado }),
          ...(frecuencia !== undefined && { frecuencia: frecuencia.toUpperCase() }),
          ...(diaVencimiento !== undefined && { diaVencimiento }),
          ...(proximaFechaPago !== undefined && {
            proximaFechaPago: new Date(`${proximaFechaPago}T00:00:00.000Z`),
          }),
          ...(proveedor !== undefined && { proveedor: proveedor.trim() }),
          ...(notas !== undefined && { notas: notas.trim() }),
          ...(activo !== undefined && { activo }),
          ...(metodoPagoId !== undefined && { metodoPagoId: metodoPagoId || null }),
        },
      });

      return res.json({ success: true, data: updated });
    } catch (error) {
      console.error('Error al actualizar gasto fijo:', error);
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'No se pudo actualizar el gasto fijo' },
      });
    }
  }

  // Eliminar gasto fijo
  async remove(req: Request, res: Response) {
    try {
      const id = String(req.params.id);

      const countPagos = await prisma.gastoFijoPago.count({ where: { gastoFijoId: id } });
      if (countPagos > 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'HAS_PAYMENTS',
            message: `No se puede eliminar el gasto fijo porque tiene ${countPagos} pago(s) registrado(s) en su historial. Debe anular los pagos primero.`,
          },
        });
      }

      await prisma.gastoFijo.delete({ where: { id } });
      return res.json({ success: true, data: { id } });
    } catch (error) {
      console.error('Error al eliminar gasto fijo:', error);
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'No se pudo eliminar el gasto fijo' },
      });
    }
  }

  // Registrar Pago de Gasto Fijo
  async pagar(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      const { monto, metodoPagoId, fecha, notas, proveedor, concepto } = req.body as {
        monto?: number;
        metodoPagoId?: string;
        fecha?: string;
        notas?: string;
        proveedor?: string;
        concepto?: string;
      };

      const gf = await prisma.gastoFijo.findUnique({ where: { id } });
      if (!gf) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Gasto fijo no encontrado' },
        });
      }

      const montoFinal = monto && monto > 0 ? monto : Number(gf.montoEstimado);
      const fechaPagoStr = fecha || getTodayString();
      const fechaPagoDate = new Date(`${fechaPagoStr}T00:00:00.000Z`);

      // Generar ID único para el gasto
      const timestamp = Date.now().toString(36);
      const random = Math.random().toString(36).substring(2, 6);
      const gastoId = `GF-${timestamp}-${random}`.toUpperCase();

      // 1. Crear el gasto en la tabla gastos (integra con cierre de caja y lista general)
      const gasto = await prisma.gasto.create({
        data: {
          id: gastoId,
          concepto: concepto?.trim() || `Pago Gasto Fijo: ${gf.nombre}`,
          categoria: gf.categoria || 'oficina',
          fecha: fechaPagoDate,
          monto: montoFinal,
          proveedor: proveedor?.trim() || gf.proveedor || '',
          notas: notas?.trim() || `Pago recurrente de ${gf.nombre}`,
          metodoPagoId: metodoPagoId || gf.metodoPagoId || null,
          registradoPorUserId: (req as any).user?.id || null,
        },
      });

      // 2. Registrar el pago en GastoFijoPago
      const periodoPagado = gf.proximaFechaPago.toISOString().slice(0, 7);
      await prisma.gastoFijoPago.create({
        data: {
          gastoFijoId: gf.id,
          gastoId: gasto.id,
          montoPagado: montoFinal,
          fechaPago: fechaPagoDate,
          periodoPagado,
        },
      });

      // 3. Avanzar la próxima fecha de pago del gasto fijo
      const nuevaProximaFecha = calculateNextDueDate(
        gf.proximaFechaPago,
        gf.frecuencia,
        gf.diaVencimiento
      );

      const updatedGastoFijo = await prisma.gastoFijo.update({
        where: { id },
        data: { proximaFechaPago: nuevaProximaFecha },
      });

      return res.json({
        success: true,
        data: {
          gasto,
          gastoFijo: updatedGastoFijo,
          periodoPagado,
        },
      });
    } catch (error) {
      console.error('Error al registrar pago de gasto fijo:', error);
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'No se pudo registrar el pago' },
      });
    }
  }

  // Eliminar Pago de Gasto Fijo (Anula egreso y reingresa dinero a la cuenta)
  async deletePago(req: Request, res: Response) {
    try {
      const pagoId = String(req.params.pagoId);
      const pago = await prisma.gastoFijoPago.findUnique({
        where: { id: pagoId },
        include: { gasto: true },
      });

      if (!pago) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Registro de pago no encontrado' },
        });
      }

      // Al eliminar el Gasto asociado, se revierte automáticamente el saldo en la cuenta de método de pago
      if (pago.gastoId) {
        await prisma.gasto.delete({ where: { id: pago.gastoId } }).catch(() => undefined);
      } else {
        await prisma.gastoFijoPago.delete({ where: { id: pagoId } });
      }

      return res.json({
        success: true,
        message: 'Pago eliminado exitosamente. El egreso fue anulado de la cuenta.',
      });
    } catch (error) {
      console.error('Error al eliminar pago de gasto fijo:', error);
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'No se pudo eliminar el pago' },
      });
    }
  }
}

