import type { Request, Response } from 'express';
import { prisma } from '../../../../../config/prismaClient.js';

async function nextGastoId(): Promise<string> {
  const rows = await prisma.gasto.findMany({ select: { id: true } });
  const max = rows.reduce((m, r) => {
    const match = String(r.id).match(/^GTO-(\d+)$/);
    if (match) {
      const n = parseInt(match[1], 10);
      return Number.isFinite(n) && n > m ? n : m;
    }
    return m;
  }, 0);
  return `GTO-${String(max + 1).padStart(3, '0')}`;
}

export class GastosController {
  // --- GASTOS CRUD ---

  async list(_req: Request, res: Response): Promise<Response> {
    try {
      const gastos = await prisma.gasto.findMany({
        include: { metodoPago: true },
        orderBy: { fecha: 'desc' },
      });
      return res.status(200).json({ success: true, data: gastos });
    } catch (error) {
      console.error('[gastos/list]', error);
      return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al obtener gastos' } });
    }
  }

  async create(req: Request, res: Response): Promise<Response> {
    try {
      const b = req.body || {};
      if (!b.concepto || !b.fecha || b.monto === undefined) {
        return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Concepto, fecha y monto son requeridos' } });
      }

      const id = b.id && String(b.id).startsWith('GTO-') ? b.id : await nextGastoId();
      
      const gasto = await prisma.gasto.create({
        data: {
          id,
          concepto: b.concepto,
          categoria: b.categoria ?? 'oficina',
          fecha: new Date(b.fecha),
          monto: Number(b.monto),
          proveedor: b.proveedor ?? '',
          notas: b.notas ?? '',
          proyectoId: b.proyectoId || null,
          metodoPagoId: b.metodoPagoId || null,
        },
        include: { metodoPago: true },
      });

      return res.status(201).json({ success: true, data: gasto });
    } catch (error) {
      console.error('[gastos/create]', error);
      return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al crear gasto' } });
    }
  }

  async update(req: Request, res: Response): Promise<Response> {
    try {
      const { id } = req.params;
      const b = req.body || {};

      if (!b.concepto || !b.fecha || b.monto === undefined) {
        return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Concepto, fecha y monto son requeridos' } });
      }

      const gasto = await prisma.gasto.update({
        where: { id: String(id) },
        data: {
          concepto: b.concepto,
          categoria: b.categoria,
          fecha: new Date(b.fecha),
          monto: Number(b.monto),
          proveedor: b.proveedor ?? '',
          notas: b.notas ?? '',
          proyectoId: b.proyectoId || null,
          metodoPagoId: b.metodoPagoId || null,
        },
        include: { metodoPago: true },
      });

      return res.status(200).json({ success: true, data: gasto });
    } catch (error) {
      console.error('[gastos/update]', error);
      return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al actualizar gasto' } });
    }
  }

  async remove(req: Request, res: Response): Promise<Response> {
    try {
      const { id } = req.params;
      await prisma.gasto.delete({
        where: { id: String(id) },
      });
      return res.status(200).json({ success: true, data: { id } });
    } catch (error) {
      console.error('[gastos/remove]', error);
      return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al eliminar gasto' } });
    }
  }

  // --- CIERRES DE CAJA ---

  async listCierres(_req: Request, res: Response): Promise<Response> {
    try {
      const cierres = await prisma.cierreCaja.findMany({
        include: { usuario: { select: { nombre: true } } },
        orderBy: { fecha: 'desc' },
      });
      return res.status(200).json({ success: true, data: cierres });
    } catch (error) {
      console.error('[cierre/list]', error);
      return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al listar cierres de caja' } });
    }
  }

  async previewCierre(req: Request, res: Response): Promise<Response> {
    try {
      const { desde, hasta } = req.query;
      if (!desde || !hasta) {
        return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Fechas desde y hasta son requeridas' } });
      }

      const desdeDate = new Date(String(desde));
      const hastaLimit = new Date(String(hasta));
      hastaLimit.setHours(23, 59, 59, 999);

      // 1. Obtener ingresos (proformas aceptadas/pagadas)
      const proformas = await prisma.proforma.findMany({
        where: {
          estado: { in: ['Aprobada', 'Pagada'] },
          fecha: { gte: desdeDate, lte: hastaLimit },
        },
        include: { metodoPago: true, items: true },
      });

      // Calcular montos de ingresos por método de pago
      const ingresosDetalle: Record<string, { id: string; nombre: string; total: number }> = {};
      let totalIngresos = 0;

      for (const p of proformas) {
        const subtotal = p.items.reduce((s, item) => s + (Number(item.cantidad) * Number(item.precioUnitario)), 0);
        const total = subtotal * (1 + Number(p.iva));
        totalIngresos += total;

        const methodId = p.metodoPagoId || 'no_especificado';
        const methodName = p.metodoPago?.nombre || 'No especificado';
        if (!ingresosDetalle[methodId]) {
          ingresosDetalle[methodId] = { id: methodId, nombre: methodName, total: 0 };
        }
        ingresosDetalle[methodId].total += total;
      }

      // 2. Obtener egresos (gastos + abonos de compra)
      const gastos = await prisma.gasto.findMany({
        where: { fecha: { gte: desdeDate, lte: hastaLimit } },
        include: { metodoPago: true },
      });

      const abonos = await prisma.abonoCompra.findMany({
        where: { fecha: { gte: desdeDate, lte: hastaLimit } },
        include: { metodoPago: true },
      });

      // Calcular montos de egresos por método de pago
      const egresosDetalle: Record<string, { id: string; nombre: string; total: number }> = {};
      let totalEgresos = 0;

      for (const g of gastos) {
        const monto = Number(g.monto);
        totalEgresos += monto;
        const methodId = g.metodoPagoId || 'no_especificado';
        const methodName = g.metodoPago?.nombre || 'No especificado';
        if (!egresosDetalle[methodId]) {
          egresosDetalle[methodId] = { id: methodId, nombre: methodName, total: 0 };
        }
        egresosDetalle[methodId].total += monto;
      }

      for (const ab of abonos) {
        const monto = Number(ab.monto);
        totalEgresos += monto;
        const methodId = ab.metodoPagoId || 'no_especificado';
        const methodName = ab.metodoPago?.nombre || 'No especificado';
        if (!egresosDetalle[methodId]) {
          egresosDetalle[methodId] = { id: methodId, nombre: methodName, total: 0 };
        }
        egresosDetalle[methodId].total += monto;
      }

      // 3. Consolidar por métodos de pago
      const metodosPago = await prisma.metodoPago.findMany();
      const metodosDetalleList = metodosPago.map(m => {
        const ingreso = ingresosDetalle[m.id]?.total || 0;
        const egreso = egresosDetalle[m.id]?.total || 0;
        return {
          metodoPagoId: m.id,
          nombre: m.nombre,
          ingresos: ingreso,
          egresos: egreso,
          balance: ingreso - egreso,
        };
      });

      // Incluir no clasificados si existen montos
      const noEspIng = ingresosDetalle['no_especificado']?.total || 0;
      const noEspEgr = egresosDetalle['no_especificado']?.total || 0;
      if (noEspIng > 0 || noEspEgr > 0) {
        metodosDetalleList.push({
          metodoPagoId: 'no_especificado',
          nombre: 'No especificado',
          ingresos: noEspIng,
          egresos: noEspEgr,
          balance: noEspIng - noEspEgr,
        });
      }

      return res.status(200).json({
        success: true,
        data: {
          fechaInicio: desde,
          fechaFin: hasta,
          totalIngresos,
          totalEgresos,
          balance: totalIngresos - totalEgresos,
          metodosDetalle: metodosDetalleList,
          ingresosConteo: proformas.length,
          egresosConteo: gastos.length + abonos.length,
        },
      });
    } catch (error) {
      console.error('[cierre/preview]', error);
      return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al generar previsualización de cierre' } });
    }
  }

  async saveCierre(req: Request, res: Response): Promise<Response> {
    try {
      const b = req.body || {};
      if (!b.fechaInicio || !b.fechaFin || b.totalIngresos === undefined || b.totalEgresos === undefined) {
        return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Datos incompletos para cierre de caja' } });
      }

      const usuarioId = (req as any).user?.id || null;

      const cierre = await prisma.cierreCaja.create({
        data: {
          fechaInicio: new Date(b.fechaInicio),
          fechaFin: new Date(b.fechaFin),
          totalIngresos: Number(b.totalIngresos),
          totalEgresos: Number(b.totalEgresos),
          balance: Number(b.totalIngresos) - Number(b.totalEgresos),
          metodosDetalle: JSON.stringify(b.metodosDetalle || []),
          observaciones: b.observaciones ?? '',
          usuarioId,
        },
      });

      return res.status(201).json({ success: true, data: cierre });
    } catch (error) {
      console.error('[cierre/save]', error);
      return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al registrar cierre de caja' } });
    }
  }

  // --- REPORTES FINANCIEROS DASHBOARD ---

  async getReportesDashboard(req: Request, res: Response): Promise<Response> {
    try {
      const { desde, hasta } = req.query;

      // Por defecto, últimos 30 días
      let desdeDate = new Date();
      desdeDate.setDate(desdeDate.getDate() - 30);
      if (desde) desdeDate = new Date(String(desde));

      let hastaLimit = new Date();
      hastaLimit.setHours(23, 59, 59, 999);
      if (hasta) {
        hastaLimit = new Date(String(hasta));
        hastaLimit.setHours(23, 59, 59, 999);
      }

      // 1. Ingresos
      const proformas = await prisma.proforma.findMany({
        where: {
          estado: { in: ['Aprobada', 'Pagada'] },
          fecha: { gte: desdeDate, lte: hastaLimit },
        },
        include: { items: true, metodoPago: true },
      });

      let totalIngresos = 0;
      const ingresosMetodo: Record<string, number> = {};

      for (const p of proformas) {
        const sub = p.items.reduce((s, i) => s + (Number(i.cantidad) * Number(i.precioUnitario)), 0);
        const tot = sub * (1 + Number(p.iva));
        totalIngresos += tot;

        const method = p.metodoPago?.nombre || 'No especificado';
        ingresosMetodo[method] = (ingresosMetodo[method] || 0) + tot;
      }

      // 2. Egresos
      const gastos = await prisma.gasto.findMany({
        where: { fecha: { gte: desdeDate, lte: hastaLimit } },
        include: { metodoPago: true },
      });

      const abonos = await prisma.abonoCompra.findMany({
        where: { fecha: { gte: desdeDate, lte: hastaLimit } },
        include: { metodoPago: true },
      });

      let totalEgresos = 0;
      const egresosCategoria: Record<string, number> = {};
      const egresosMetodo: Record<string, number> = {};

      for (const g of gastos) {
        const monto = Number(g.monto);
        totalEgresos += monto;
        
        egresosCategoria[g.categoria] = (egresosCategoria[g.categoria] || 0) + monto;
        const method = g.metodoPago?.nombre || 'No especificado';
        egresosMetodo[method] = (egresosMetodo[method] || 0) + monto;
      }

      for (const ab of abonos) {
        const monto = Number(ab.monto);
        totalEgresos += monto;

        egresosCategoria['compras'] = (egresosCategoria['compras'] || 0) + monto;
        const method = ab.metodoPago?.nombre || 'No especificado';
        egresosMetodo[method] = (egresosMetodo[method] || 0) + monto;
      }

      // 3. Evolución mensual (últimos 6 meses)
      const hoy = new Date();
      const mesesEvolucion = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
        const mesInicio = new Date(d.getFullYear(), d.getMonth(), 1);
        const mesFin = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);

        // Ingresos del mes
        const profsMes = await prisma.proforma.findMany({
          where: {
            estado: { in: ['Aprobada', 'Pagada'] },
            fecha: { gte: mesInicio, lte: mesFin },
          },
          include: { items: true },
        });

        let ingMes = 0;
        for (const p of profsMes) {
          const sub = p.items.reduce((s, item) => s + (Number(item.cantidad) * Number(item.precioUnitario)), 0);
          ingMes += sub * (1 + Number(p.iva));
        }

        // Egresos del mes
        const gastsMes = await prisma.gasto.findMany({
          where: { fecha: { gte: mesInicio, lte: mesFin } },
        });
        const absMes = await prisma.abonoCompra.findMany({
          where: { fecha: { gte: mesInicio, lte: mesFin } },
        });

        const egrMes = 
          gastsMes.reduce((s, g) => s + Number(g.monto), 0) + 
          absMes.reduce((s, ab) => s + Number(ab.monto), 0);

        const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        mesesEvolucion.push({
          label: MONTH_NAMES[d.getMonth()] + ' ' + d.getFullYear().toString().slice(-2),
          ingresos: ingMes,
          egresos: egrMes,
          balance: ingMes - egrMes,
        });
      }

      // Formatear desgloses para consumo del frontend
      const categsBreakdown = Object.entries(egresosCategoria).map(([label, value]) => ({ label, value }));
      const ingMetodoBreakdown = Object.entries(ingresosMetodo).map(([label, value]) => ({ label, value }));
      const egrMetodoBreakdown = Object.entries(egresosMetodo).map(([label, value]) => ({ label, value }));

      return res.status(200).json({
        success: true,
        data: {
          kpi: {
            ingresos: totalIngresos,
            egresos: totalEgresos,
            balance: totalIngresos - totalEgresos,
            conteoVentas: proformas.length,
            conteoEgresos: gastos.length + abonos.length,
          },
          breakdownCategorias: categsBreakdown,
          breakdownIngresosMetodo: ingMetodoBreakdown,
          breakdownEgresosMetodo: egrMetodoBreakdown,
          evolucionMensual: mesesEvolucion,
        },
      });
    } catch (error) {
      console.error('[reportes/dashboard]', error);
      return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al generar reportes financieros' } });
    }
  }
}
