import type { Request, Response } from 'express';
import { prisma } from '../../../../../config/prismaClient.js';
import { Prisma } from '@prisma/client';

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

  async list(req: Request, res: Response): Promise<Response> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 25;
      const search = (req.query.search as string || '').toLowerCase();
      const origenFiltro = req.query.origen as string || 'todos';

      const [gastos, abonosCompra, nominas, anticipos, compromisosOC] = await Promise.all([
        prisma.gasto.findMany({
          include: {
            metodoPago: true,
            registradoPor: { select: { id: true, nombre: true } },
          },
          orderBy: { fecha: 'desc' },
        }),
        prisma.abonoCompra.findMany({
          include: {
            metodoPago: true,
            registradoPor: { select: { id: true, nombre: true } },
            ordenCompra: {
              include: {
                proveedor: { select: { nombre: true } },
                cuentaPorPagar: {
                  select: { montoTotal: true, montoPagado: true, saldo: true },
                },
              },
            },
          },
          orderBy: { fecha: 'desc' },
        }),
        prisma.nominaRegistro.findMany({
          include: { empleado: { select: { nombre: true } } },
        }),
        prisma.egreso.findMany({
          where: { tipo: 'ANTICIPO' },
          include: { empleado: { select: { nombre: true } } },
          orderBy: { fecha: 'desc' },
        }),
        prisma.cuentaPorPagar.findMany({
          where: {
            saldo: { gt: 0.01 },
            ordenCompra: {
              estado: { in: ['aprobada', 'parcialmente_recibida'] },
            },
          },
          include: {
            ordenCompra: {
              include: { proveedor: { select: { nombre: true } } },
            },
          },
        }),
      ]);

      const gastosManual = gastos.map((g) => ({
        id: g.id,
        concepto: g.concepto,
        categoria: g.categoria,
        fecha: g.fecha,
        monto: Number(g.monto),
        proveedor: g.proveedor,
        notas: g.notas,
        metodoPagoId: g.metodoPagoId,
        metodoPago: g.metodoPago,
        registradoPor: g.registradoPor,
        origen: 'gasto' as const,
        readonly: false,
        referencia: '',
      }));

      const pagosCompra = abonosCompra.map((ab) => {
        const ref = ab.referencia || '';
        const esPagoAjuste = /ajuste por edición/i.test(ref);
        const cxp = ab.ordenCompra?.cuentaPorPagar;
        return {
          id: ab.id,
          concepto: esPagoAjuste
            ? `Pago ajuste OC ${ab.ordenCompra?.numero || ''}`.trim()
            : `Pago OC ${ab.ordenCompra?.numero || ''}`.trim(),
          categoria: 'compras',
          fecha: ab.fecha,
          monto: Number(ab.monto),
          proveedor: ab.ordenCompra?.proveedor?.nombre || 'Sin proveedor',
          notas: ref,
          metodoPagoId: ab.metodoPagoId,
          metodoPago: ab.metodoPago,
          registradoPor: ab.registradoPor,
          origen: 'orden_compra' as const,
          readonly: true,
          referencia: ref,
          ordenCompraId: ab.ordenCompraId,
          ordenNumero: ab.ordenCompra?.numero || null,
          ordenTotal: cxp ? Number(cxp.montoTotal) : null,
          ordenPagado: cxp ? Number(cxp.montoPagado) : null,
          ordenSaldo: cxp ? Number(cxp.saldo) : null,
          esPagoAjuste,
        };
      });

      const pagosNomina: any[] = [];
      nominas.forEach((n) => {
        const abonosRaw = n.abonos as any;
        const abonosArr = Array.isArray(abonosRaw) ? abonosRaw : typeof abonosRaw === 'string' ? JSON.parse(abonosRaw) : [];
        if (abonosArr && abonosArr.length > 0) {
          abonosArr.forEach((ab: any, index: number) => {
            pagosNomina.push({
              id: `nomina-abono-${n.id}-${index}`,
              concepto: `Pago Nómina - ${n.empleado?.nombre || 'Sin nombre'}`,
              categoria: 'recursos_humanos',
              fecha: ab.fecha ? new Date(ab.fecha) : n.updatedAt,
              monto: Number(ab.monto || 0),
              proveedor: 'Personal',
              notas: ab.referencia || `Liquidación nómina (${new Date(n.fechaInicio).toLocaleDateString()} al ${new Date(n.fechaFin).toLocaleDateString()})`,
              metodoPagoId: ab.metodoPagoId || null,
              metodoPago: null,
              registradoPor: null,
              origen: 'pago_nomina' as const,
              readonly: true,
              referencia: ab.referencia || '',
            });
          });
        }
      });

      const anticiposEmpleados = anticipos.map((ant) => ({
        id: ant.id,
        concepto: `Anticipo de Sueldo - ${ant.empleado?.nombre || 'Sin nombre'}`,
        categoria: 'recursos_humanos',
        fecha: ant.fecha,
        monto: Number(ant.monto),
        proveedor: 'Personal',
        notas: ant.motivo || 'Anticipo registrado en RRHH',
        metodoPagoId: null,
        metodoPago: null,
        registradoPor: null,
        origen: 'anticipo_empleado' as const,
        readonly: true,
        referencia: '',
      }));

      const saldosPendientes = compromisosOC.map((cxp) => {
        const total = Number(cxp.montoTotal);
        const saldo = Number(cxp.saldo);
        return {
          id: `cxp-saldo-${cxp.id}`,
          concepto: `Saldo pendiente OC ${cxp.ordenCompra?.numero || ''}`.trim(),
          categoria: 'compras',
          fecha: cxp.ordenCompra?.fecha || new Date(),
          monto: saldo,
          proveedor: cxp.ordenCompra?.proveedor?.nombre || 'Sin proveedor',
          notas: `Total orden $${total.toFixed(2)} — aún por pagar en caja`,
          metodoPagoId: null,
          metodoPago: null,
          registradoPor: null,
          origen: 'cuenta_por_pagar' as const,
          readonly: true,
          referencia: '',
          ordenCompraId: cxp.ordenCompraId,
          ordenNumero: cxp.ordenCompra?.numero || null,
          ordenTotal: total,
          ordenPagado: Number(cxp.montoPagado),
          ordenSaldo: saldo,
          esCompromiso: true,
        };
      });

      let filteredData = [...gastosManual, ...pagosCompra, ...pagosNomina, ...anticiposEmpleados, ...saldosPendientes].sort(
        (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime(),
      );

      // Filtering by origen
      if (origenFiltro !== 'todos') {
        filteredData = filteredData.filter((g) => {
          if (origenFiltro === 'gasto') return g.origen !== 'orden_compra' && g.origen !== 'cuenta_por_pagar' && g.origen !== 'pago_nomina' && g.origen !== 'anticipo_empleado';
          if (origenFiltro === 'nomina_anticipo') return g.origen === 'pago_nomina' || g.origen === 'anticipo_empleado';
          if (origenFiltro === 'orden_compra') return g.origen === 'orden_compra';
          if (origenFiltro === 'cuenta_por_pagar') return g.origen === 'cuenta_por_pagar';
          return true;
        });
      }

      // Filtering by search query
      if (search) {
        filteredData = filteredData.filter((g) =>
          g.concepto?.toLowerCase().includes(search) ||
          g.categoria?.toLowerCase().includes(search) ||
          g.proveedor?.toLowerCase().includes(search) ||
          g.referencia?.toLowerCase().includes(search) ||
          g.notas?.toLowerCase().includes(search) ||
          (g as any).registradoPor?.nombre?.toLowerCase().includes(search) ||
          g.ordenNumero?.toLowerCase().includes(search)
        );
      }

      // Pagination
      const totalCount = filteredData.length;
      const totalPages = Math.ceil(totalCount / limit);
      const data = filteredData.slice((page - 1) * limit, page * limit);

      return res.status(200).json({ 
        success: true, 
        data,
        pagination: { totalCount, totalPages, currentPage: page, limit }
      });
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
      const registradoPorUserId = (req as { user?: { id?: string } }).user?.id || null;

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
          registradoPorUserId: registradoPorUserId ?? undefined,
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
      const pagoCompra = await prisma.abonoCompra.findUnique({ where: { id: String(id) } });
      if (pagoCompra) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Los pagos de órdenes de compra no se eliminan desde Gastos.' },
        });
      }
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

      const desdeStr = String(desde);
      const desdeDate = desdeStr.includes('T') ? new Date(desdeStr) : new Date(desdeStr + 'T00:00:00');

      const hastaStr = String(hasta);
      const hastaLimit = hastaStr.includes('T') ? new Date(hastaStr) : new Date(hastaStr + 'T23:59:59.999');

      // 1. Obtener ingresos (abonos reales de proformas)
      const abonosProforma = await prisma.abonoProforma.findMany({
        where: {
          fecha: { gte: desdeDate, lte: hastaLimit },
        },
        include: { 
          metodoPago: true,
          registradoPor: { select: { id: true, nombre: true } }
        },
      });

      // Calcular montos de ingresos por método de pago
      const ingresosDetalle: Record<string, { id: string; nombre: string; total: number }> = {};
      let totalIngresos = 0;

      for (const ab of abonosProforma) {
        const total = Number(ab.monto);
        totalIngresos += total;

        const methodId = ab.metodoPagoId || 'no_especificado';
        const methodName = ab.metodoPago?.nombre || 'No especificado';
        if (!ingresosDetalle[methodId]) {
          ingresosDetalle[methodId] = { id: methodId, nombre: methodName, total: 0 };
        }
        ingresosDetalle[methodId].total += total;
      }

      // 2. Obtener egresos (gastos + abonos de compra)
      const gastos = await prisma.gasto.findMany({
        where: { fecha: { gte: desdeDate, lte: hastaLimit } },
        include: { 
          metodoPago: true,
          registradoPor: { select: { id: true, nombre: true } },
          mantenimientos: true
        },
      });

      const abonos = await prisma.abonoCompra.findMany({
        where: { fecha: { gte: desdeDate, lte: hastaLimit } },
        include: { 
          metodoPago: true,
          registradoPor: { select: { id: true, nombre: true } }
        },
      });

      const anticipos = await prisma.egreso.findMany({
        where: {
          tipo: 'ANTICIPO',
          fecha: { gte: desdeDate, lte: hastaLimit }
        }
      });

      const nominas = await prisma.nominaRegistro.findMany({
        // For nomina, since payments can happen anytime during the period, 
        // we'll filter them below by the abono's date if it exists
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

      for (const ant of anticipos) {
        const monto = Number(ant.monto);
        totalEgresos += monto;
        const methodId = 'no_especificado';
        if (!egresosDetalle[methodId]) {
          egresosDetalle[methodId] = { id: methodId, nombre: 'No especificado', total: 0 };
        }
        egresosDetalle[methodId].total += monto;
      }

      nominas.forEach(n => {
        const abonosRaw = n.abonos as any;
        const abonosArr = Array.isArray(abonosRaw) ? abonosRaw : typeof abonosRaw === 'string' ? JSON.parse(abonosRaw) : [];
        if (abonosArr && abonosArr.length > 0) {
          abonosArr.forEach((ab: any) => {
            const abDate = ab.fecha ? new Date(ab.fecha) : n.updatedAt;
            if (abDate >= desdeDate && abDate <= hastaLimit) {
              const monto = Number(ab.monto || 0);
              totalEgresos += monto;
              const methodId = ab.metodoPagoId || 'no_especificado';
              if (!egresosDetalle[methodId]) {
                egresosDetalle[methodId] = { id: methodId, nombre: 'No especificado', total: 0 };
              }
              egresosDetalle[methodId].total += monto;
            }
          });
        }
      });

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

      // 4. Segmentación por Secciones de Ingresos (Abonos Iniciales vs Posteriores)
      let abonosInicialesSum = 0;
      let abonosPosterioresSum = 0;

      if (abonosProforma.length > 0) {
        const proformaIds = [...new Set(abonosProforma.map(ab => ab.proformaId))];
        
        // Cargar todos los abonos para estas proformas para determinar el primero cronológico
        const allAbonosForProformas = await prisma.abonoProforma.findMany({
          where: { proformaId: { in: proformaIds } },
          orderBy: { fecha: 'asc' },
        });

        const firstAbonoIdByProforma = new Map<string, string>();
        for (const ab of allAbonosForProformas) {
          if (!firstAbonoIdByProforma.has(ab.proformaId)) {
            firstAbonoIdByProforma.set(ab.proformaId, ab.id);
          }
        }

        for (const ab of abonosProforma) {
          const isInicial = firstAbonoIdByProforma.get(ab.proformaId) === ab.id;
          if (isInicial) {
            abonosInicialesSum += Number(ab.monto);
          } else {
            abonosPosterioresSum += Number(ab.monto);
          }
        }
      }

      // 5. Segmentación por Secciones de Egresos
      let egresosGeneralesSum = 0;
      let egresosAutoSum = 0;
      let egresosComprasSum = 0; // AbonosCompra
      let egresosPagosSum = 0;   // Nominas/personal/pagos category

      for (const g of gastos) {
        const monto = Number(g.monto);
        const cat = (g.categoria || '').toLowerCase();
        const isAuto = cat === 'vehiculos' || cat === 'vehiculo' || cat === 'auto' || (g.mantenimientos && g.mantenimientos.length > 0);
        const isPago = cat === 'nomina' || cat === 'nominas' || cat === 'personal' || cat === 'pagos' || cat === 'pago';

        if (isAuto) {
          egresosAutoSum += monto;
        } else if (isPago) {
          egresosPagosSum += monto;
        } else {
          egresosGeneralesSum += monto;
        }
      }

      for (const ab of abonos) {
        egresosComprasSum += Number(ab.monto);
      }

      // 6. Segmentación por Usuario
      const usuariosDetalleMap: Record<string, { id: string; nombre: string; ingresos: number; egresos: number; balance: number }> = {};

      const addUsuarioTx = (userId: string | null, userName: string | null, monto: number, type: 'ingreso' | 'egreso') => {
        const uid = userId || 'sistema';
        const name = userName || 'Sistema / General';
        if (!usuariosDetalleMap[uid]) {
          usuariosDetalleMap[uid] = { id: uid, nombre: name, ingresos: 0, egresos: 0, balance: 0 };
        }
        if (type === 'ingreso') {
          usuariosDetalleMap[uid].ingresos += monto;
        } else {
          usuariosDetalleMap[uid].egresos += monto;
        }
        usuariosDetalleMap[uid].balance = usuariosDetalleMap[uid].ingresos - usuariosDetalleMap[uid].egresos;
      };

      for (const ab of abonosProforma) {
        addUsuarioTx(ab.registradoPorUserId, ab.registradoPor?.nombre || 'No especificado', Number(ab.monto), 'ingreso');
      }
      for (const g of gastos) {
        addUsuarioTx(g.registradoPorUserId, g.registradoPor?.nombre || 'No especificado', Number(g.monto), 'egreso');
      }
      for (const ab of abonos) {
        addUsuarioTx(ab.registradoPorUserId, ab.registradoPor?.nombre || 'No especificado', Number(ab.monto), 'egreso');
      }

      const usuariosDetalle = Object.values(usuariosDetalleMap);

      return res.status(200).json({
        success: true,
        data: {
          fechaInicio: desde,
          fechaFin: hasta,
          totalIngresos,
          totalEgresos,
          balance: totalIngresos - totalEgresos,
          metodosDetalle: metodosDetalleList,
          ingresosConteo: abonosProforma.length,
          egresosConteo: gastos.length + abonos.length,

          // Secciones de Ingresos
          seccionIngresos: {
            abonosIniciales: abonosInicialesSum,
            abonosPosteriores: abonosPosterioresSum,
          },

          // Secciones de Egresos
          seccionEgresos: {
            gastosGenerales: egresosGeneralesSum,
            gastosAuto: egresosAutoSum,
            gastosCompras: egresosComprasSum,
            gastosPagos: egresosPagosSum,
          },

          // Detalle por Usuario
          usuariosDetalle,
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

  // --- MOVIMIENTOS FINANCIEROS (VISTA UNIFICADA) ---

  async listMovimientos(req: Request, res: Response): Promise<Response> {
    try {
      const { desde, hasta, tipo, metodoPagoId } = req.query;

      // Default: últimos 30 días
      let desdeDate = new Date();
      desdeDate.setDate(desdeDate.getDate() - 30);
      desdeDate.setHours(0, 0, 0, 0);

      if (desde) {
        const desdeStr = String(desde);
        desdeDate = desdeStr.includes('T') ? new Date(desdeStr) : new Date(desdeStr + 'T00:00:00');
      }

      let hastaLimit = new Date();
      hastaLimit.setHours(23, 59, 59, 999);

      if (hasta) {
        const hastaStr = String(hasta);
        hastaLimit = hastaStr.includes('T') ? new Date(hastaStr) : new Date(hastaStr + 'T23:59:59.999');
      }

      interface Movimiento {
        id: string;
        tipo: 'ingreso' | 'egreso';
        origen: 'proforma' | 'gasto' | 'orden_compra' | 'cuenta_por_pagar' | 'pago_nomina' | 'anticipo_empleado';
        fecha: Date;
        monto: number;
        descripcion: string;
        referencia: string;
        metodoPago: string;
        metodoPagoId: string | null;
        entidad: string;
        usuario: string;
        esCompromiso?: boolean;
        ordenTotal?: number | null;
        ordenSaldo?: number | null;
        esPagoAjuste?: boolean;
      }

      const movimientos: Movimiento[] = [];

      // 1. INGRESOS — AbonoProforma
      if (!tipo || tipo === 'todos' || tipo === 'ingreso') {
        const whereIngreso: any = {
          fecha: { gte: desdeDate, lte: hastaLimit },
        };
        if (metodoPagoId) whereIngreso.metodoPagoId = String(metodoPagoId);

        const abonosProforma = await prisma.abonoProforma.findMany({
          where: whereIngreso,
          include: {
            metodoPago: true,
            registradoPor: { select: { nombre: true } },
            proforma: {
              include: {
                cliente: { select: { nombre: true } },
              },
            },
          },
          orderBy: { fecha: 'desc' },
        });

        for (const ab of abonosProforma) {
          movimientos.push({
            id: ab.id,
            tipo: 'ingreso',
            origen: 'proforma',
            fecha: ab.fecha,
            monto: Number(ab.monto),
            descripcion: `Cobro Proforma ${ab.proforma?.id || ab.proformaId || ''}`,
            referencia: ab.referencia || '',
            metodoPago: ab.metodoPago?.nombre || 'No especificado',
            metodoPagoId: ab.metodoPagoId,
            entidad: ab.proforma?.clienteNombre || ab.proforma?.cliente?.nombre || 'Cliente no especificado',
            usuario: ab.registradoPor?.nombre || '—',
          });
        }
      }

      // 2. EGRESOS — Gastos
      if (!tipo || tipo === 'todos' || tipo === 'egreso') {
        const whereGasto: any = {
          fecha: { gte: desdeDate, lte: hastaLimit },
        };
        if (metodoPagoId) whereGasto.metodoPagoId = String(metodoPagoId);

        const gastos = await prisma.gasto.findMany({
          where: whereGasto,
          include: {
            metodoPago: true,
            registradoPor: { select: { nombre: true } },
          },
          orderBy: { fecha: 'desc' },
        });

        for (const g of gastos) {
          movimientos.push({
            id: g.id,
            tipo: 'egreso',
            origen: 'gasto',
            fecha: g.fecha,
            monto: Number(g.monto),
            descripcion: g.concepto,
            referencia: '',
            metodoPago: g.metodoPago?.nombre || 'No especificado',
            metodoPagoId: g.metodoPagoId,
            entidad: g.proveedor || g.categoria || '',
            usuario: g.registradoPor?.nombre || '—',
          });
        }

        // 3. EGRESOS — AbonoCompra
        const whereAbono: any = {
          fecha: { gte: desdeDate, lte: hastaLimit },
        };
        if (metodoPagoId) whereAbono.metodoPagoId = String(metodoPagoId);

        const abonosCompra = await prisma.abonoCompra.findMany({
          where: whereAbono,
          include: {
            metodoPago: true,
            registradoPor: { select: { nombre: true } },
            ordenCompra: {
              include: {
                proveedor: { select: { nombre: true } },
                cuentaPorPagar: {
                  select: { montoTotal: true, montoPagado: true, saldo: true },
                },
              },
            },
          },
          orderBy: { fecha: 'desc' },
        });

        for (const ab of abonosCompra) {
          const ref = ab.referencia || '';
          const esPagoAjuste = /ajuste por edición/i.test(ref);
          const cxp = ab.ordenCompra?.cuentaPorPagar;
          const baseDesc = esPagoAjuste
            ? `Pago ajuste OC ${ab.ordenCompra?.numero || ''}`
            : `Pago OC ${ab.ordenCompra?.numero || ''}`;
          movimientos.push({
            id: ab.id,
            tipo: 'egreso',
            origen: 'orden_compra',
            fecha: ab.fecha,
            monto: Number(ab.monto),
            descripcion: ref ? `${baseDesc} — ${ref}`.trim() : baseDesc,
            referencia: ref,
            metodoPago: ab.metodoPago?.nombre || 'No especificado',
            metodoPagoId: ab.metodoPagoId,
            entidad: ab.ordenCompra?.proveedor?.nombre || 'Sin proveedor',
            usuario: ab.registradoPor?.nombre || '—',
            ordenTotal: cxp ? Number(cxp.montoTotal) : null,
            ordenSaldo: cxp ? Number(cxp.saldo) : null,
            esPagoAjuste,
          });
        }

        // 3.5 EGRESOS — Anticipos y Nomina
        const anticipos = await prisma.egreso.findMany({
          where: {
            tipo: 'ANTICIPO',
            fecha: { gte: desdeDate, lte: hastaLimit }
          },
          include: { empleado: { select: { nombre: true } } }
        });

        for (const ant of anticipos) {
          movimientos.push({
            id: ant.id,
            tipo: 'egreso',
            origen: 'anticipo_empleado',
            fecha: ant.fecha,
            monto: Number(ant.monto),
            descripcion: `Anticipo de Sueldo - ${ant.empleado?.nombre || 'Sin nombre'}`,
            referencia: ant.motivo || '',
            metodoPago: 'No especificado',
            metodoPagoId: null,
            entidad: 'Personal',
            usuario: '—',
          });
        }

        const nominas = await prisma.nominaRegistro.findMany({
          include: { empleado: { select: { nombre: true } } }
        });

        nominas.forEach(n => {
          const abonosRaw = n.abonos as any;
          const abonosArr = Array.isArray(abonosRaw) ? abonosRaw : typeof abonosRaw === 'string' ? JSON.parse(abonosRaw) : [];
          if (abonosArr && abonosArr.length > 0) {
            abonosArr.forEach((ab: any, index: number) => {
              const abDate = ab.fecha ? new Date(ab.fecha) : n.updatedAt;
              if (abDate >= desdeDate && abDate <= hastaLimit) {
                movimientos.push({
                  id: `nomina-abono-${n.id}-${index}`,
                  tipo: 'egreso',
                  origen: 'pago_nomina',
                  fecha: abDate,
                  monto: Number(ab.monto || 0),
                  descripcion: `Pago Nómina - ${n.empleado?.nombre || 'Sin nombre'}`,
                  referencia: ab.referencia || `Liquidación nómina (${new Date(n.fechaInicio).toLocaleDateString()} al ${new Date(n.fechaFin).toLocaleDateString()})`,
                  metodoPago: 'No especificado',
                  metodoPagoId: ab.metodoPagoId || null,
                  entidad: 'Personal',
                  usuario: '—',
                });
              }
            });
          }
        });

        // 4. EGRESOS — Saldos pendientes de órdenes de compra (compromiso, no caja)
        if (!metodoPagoId) {
          const cxpPendientes = await prisma.cuentaPorPagar.findMany({
            where: {
              saldo: { gt: 0.01 },
              ordenCompra: {
                estado: { in: ['aprobada', 'parcialmente_recibida'] },
                fecha: { gte: desdeDate, lte: hastaLimit },
              },
            },
            include: {
              ordenCompra: {
                include: { proveedor: { select: { nombre: true } } },
              },
            },
          });

          for (const cxp of cxpPendientes) {
            const oc = cxp.ordenCompra;
            if (!oc) continue;
            const saldo = Number(cxp.saldo);
            const total = Number(cxp.montoTotal);
            movimientos.push({
              id: `cxp-saldo-${cxp.id}`,
              tipo: 'egreso',
              origen: 'cuenta_por_pagar',
              fecha: oc.fecha,
              monto: saldo,
              descripcion: `Saldo pendiente OC ${oc.numero}`,
              referencia: `Total orden $${total.toFixed(2)} — aún por pagar`,
              metodoPago: 'Cuenta por pagar',
              metodoPagoId: null,
              entidad: oc.proveedor?.nombre || 'Sin proveedor',
              usuario: '—',
              esCompromiso: true,
              ordenTotal: total,
              ordenSaldo: saldo,
            });
          }
        }
      }

      // Sort unified by date descending
      movimientos.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

      // Compute KPIs (caja + compromisos OC pendientes)
      const movCaja = movimientos.filter((m) => !m.esCompromiso);
      const compromisos = movimientos.filter((m) => m.esCompromiso);
      const totalIngresos = movCaja.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0);
      const totalEgresosCaja = movCaja.filter(m => m.tipo === 'egreso').reduce((s, m) => s + m.monto, 0);
      const totalCompromisos = compromisos.reduce((s, m) => s + m.monto, 0);
      const totalEgresos = totalEgresosCaja + totalCompromisos;

      return res.status(200).json({
        success: true,
        data: {
          movimientos,
          kpi: {
            totalIngresos,
            totalEgresos,
            totalEgresosCaja,
            totalCompromisos,
            balance: totalIngresos - totalEgresos,
            conteo: movimientos.length,
          },
        },
      });
    } catch (error) {
      console.error('[movimientos/list]', error);
      return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al obtener movimientos financieros' } });
    }
  }

  // --- REPORTES FINANCIEROS Y OPERATIVOS DEL DASHBOARD REDISEÑADO ---

  async getDashboardSummary(req: Request, res: Response): Promise<Response> {
    try {
      const { desde, hasta } = req.query;

      // Default: últimos 30 días
      let desdeDate = new Date();
      desdeDate.setDate(desdeDate.getDate() - 30);
      desdeDate.setHours(0, 0, 0, 0);

      if (desde) {
        const desdeStr = String(desde);
        desdeDate = desdeStr.includes('T') ? new Date(desdeStr) : new Date(desdeStr + 'T00:00:00');
      }

      let hastaLimit = new Date();
      hastaLimit.setHours(23, 59, 59, 999);

      if (hasta) {
        const hastaStr = String(hasta);
        hastaLimit = hastaStr.includes('T') ? new Date(hastaStr) : new Date(hastaStr + 'T23:59:59.999');
      }

      // 1. Usuarios y actividades
      const dbUsers = await prisma.user.findMany({
        where: { estado: 'activo' },
        select: { id: true, nombre: true, username: true, rol: true, empleadoId: true }
      });

      const userIds = dbUsers.map(u => u.id);
      const latestTaskByUser: Record<string, { id: string; titulo: string; estado: string; prioridad: string } | null> = {};
      const lastActionByUser: Record<string, { fecha: Date; accion: string; modulo: string; detalle: string } | null> = {};

      if (userIds.length > 0) {
        // Fetch active tasks in batch
        const allActiveAssignments = await prisma.tareaAsignacion.findMany({
          where: {
            userId: { in: userIds },
            tarea: { estado: { in: ['pendiente', 'en_progreso'] } }
          },
          select: {
            userId: true,
            tarea: {
              select: { id: true, titulo: true, estado: true, prioridad: true, fechaCreacion: true }
            }
          }
        });

        const latestTaskTimeByUser: Record<string, number> = {};
        for (const assign of allActiveAssignments) {
          const uid = assign.userId;
          const task = assign.tarea;
          const taskTime = new Date(task.fechaCreacion).getTime();
          if (!latestTaskByUser[uid] || taskTime > latestTaskTimeByUser[uid]) {
            latestTaskByUser[uid] = {
              id: task.id,
              titulo: task.titulo,
              estado: task.estado,
              prioridad: task.prioridad
            };
            latestTaskTimeByUser[uid] = taskTime;
          }
        }

        // Fetch last actions in batch using PostgreSQL native DISTINCT ON
        const lastActionsRaw = await prisma.$queryRaw<any[]>`
          SELECT DISTINCT ON (user_id) user_id as "userId", fecha, accion, modulo, detalle
          FROM audit_logs
          WHERE user_id IN (${Prisma.join(userIds)})
          ORDER BY user_id, fecha DESC
        `;

        for (const action of lastActionsRaw) {
          lastActionByUser[action.userId] = {
            fecha: action.fecha,
            accion: action.accion,
            modulo: action.modulo,
            detalle: action.detalle
          };
        }
      }

      const usersActivity = dbUsers.map(u => ({
        id: u.id,
        nombre: u.nombre,
        username: u.username,
        rol: u.rol,
        empleadoId: u.empleadoId,
        activeTask: latestTaskByUser[u.id] || null,
        lastAction: lastActionByUser[u.id] || null
      }));

      // 2. Cola de impresión
      const currentPrintingJob = await prisma.impresionJob.findFirst({
        where: { status: { in: ['Imprimiendo', 'Pausado', 'Listo'] } },
        select: {
          id: true,
          name: true,
          client: true,
          width: true,
          height: true,
          copies: true,
          responsible: true,
          status: true,
          elapsedSeconds: true,
          format: true,
          urgency: true,
          notes: true,
          fileUrl: true,
          proyectoNombre: true,
          proyectoId: true,
          startTime: true
        }
      });

      const printQueue = await prisma.impresionJob.findMany({
        where: { status: 'En espera' },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        take: 5,
        select: {
          id: true,
          name: true,
          client: true,
          width: true,
          height: true,
          copies: true,
          responsible: true,
          status: true,
          elapsedSeconds: true,
          format: true,
          urgency: true,
          notes: true,
          fileUrl: true,
          proyectoNombre: true,
          proyectoId: true,
          startTime: true
        }
      });

      // 3. Proformas en el período
      const proformas = await prisma.proforma.findMany({
        where: { fecha: { gte: desdeDate, lte: hastaLimit } },
        include: { items: true }
      });

      let totalFacturado = 0;
      let porAprobarCount = 0;
      let rechazadasCount = 0;
      let aprobadasCount = 0;
      let pagadasCount = 0;

      for (const prof of proformas) {
        const sub = prof.items.reduce((s, item) => s + Number(item.cantidad || 0) * Number(item.precioUnitario || 0), 0);
        const total = sub * (1 + Number(prof.iva || 0.12));
        totalFacturado += total;

        if (prof.estado === 'Pendiente') porAprobarCount++;
        else if (prof.estado === 'Rechazada') rechazadasCount++;
        else if (prof.estado === 'Aprobada') aprobadasCount++;
        else if (prof.estado === 'Pagada') pagadasCount++;
      }

      // 4. Proyectos y fases
      const proyectos = await prisma.proyecto.findMany({
        where: {
          OR: [
            { fechaCreacion: { gte: desdeDate, lte: hastaLimit } },
            { estado: 'ACTIVO' }
          ]
        },
        select: { id: true, nombre: true, faseActual: true, progreso: true, estado: true, clienteNombre: true, responsable: true }
      });

      const proyectosFaseCount = {
        DISENIO: 0,
        APROBACION: 0,
        PRODUCCION: 0,
        INSTALACION: 0,
        COMPLETADO: 0
      };

      for (const proy of proyectos) {
        const fase = proy.faseActual as keyof typeof proyectosFaseCount;
        if (proyectosFaseCount[fase] !== undefined) {
          proyectosFaseCount[fase]++;
        }
      }

      // 5. Últimos movimientos financieros y KPIs
      const abonosProforma = await prisma.abonoProforma.findMany({
        where: { fecha: { gte: desdeDate, lte: hastaLimit } },
        include: {
          metodoPago: true,
          registradoPor: { select: { nombre: true } },
          proforma: true,
        },
      });

      const dbGastos = await prisma.gasto.findMany({
        where: { fecha: { gte: desdeDate, lte: hastaLimit } },
        include: {
          metodoPago: true,
          registradoPor: { select: { nombre: true } },
        },
      });

      const abonosCompra = await prisma.abonoCompra.findMany({
        where: { fecha: { gte: desdeDate, lte: hastaLimit } },
        include: {
          metodoPago: true,
          registradoPor: { select: { nombre: true } },
          ordenCompra: {
            include: {
              proveedor: true,
              cuentaPorPagar: {
                select: { montoTotal: true, saldo: true },
              },
            },
          },
        },
      });

      interface Movement {
        id: string;
        tipo: 'ingreso' | 'egreso';
        origen: 'proforma' | 'gasto' | 'orden_compra' | 'cuenta_por_pagar';
        fecha: Date;
        monto: number;
        descripcion: string;
        referencia: string;
        metodoPago: string;
        entidad: string;
        usuario: string;
      }

      const recentMovements: Movement[] = [];
      let totalIngresos = 0;
      let totalEgresos = 0;

      // Incomes
      for (const ab of abonosProforma) {
        const monto = Number(ab.monto);
        totalIngresos += monto;
        recentMovements.push({
          id: ab.id,
          tipo: 'ingreso',
          origen: 'proforma',
          fecha: ab.fecha,
          monto,
          descripcion: `Cobro Proforma ${ab.proforma?.id || ab.proformaId || ''}`,
          referencia: ab.referencia || '',
          metodoPago: ab.metodoPago?.nombre || 'No especificado',
          entidad: ab.proforma?.clienteNombre || 'Cliente no especificado',
          usuario: ab.registradoPor?.nombre || '—',
        });
      }

      // Expenses - General Gastos
      for (const g of dbGastos) {
        const monto = Number(g.monto);
        totalEgresos += monto;
        recentMovements.push({
          id: g.id,
          tipo: 'egreso',
          origen: 'gasto',
          fecha: g.fecha,
          monto,
          descripcion: g.concepto,
          referencia: '',
          metodoPago: g.metodoPago?.nombre || 'No especificado',
          entidad: g.proveedor || g.categoria || '',
          usuario: g.registradoPor?.nombre || '—',
        });
      }

      // Expenses - OC Payments
      for (const ab of abonosCompra) {
        const monto = Number(ab.monto);
        totalEgresos += monto;
        const ref = ab.referencia || '';
        const esPagoAjuste = /ajuste por edición/i.test(ref);
        const cxp = ab.ordenCompra?.cuentaPorPagar;
        const baseDesc = esPagoAjuste
          ? `Pago ajuste OC ${ab.ordenCompra?.numero || ''}`
          : `Pago OC ${ab.ordenCompra?.numero || ''}`;
        recentMovements.push({
          id: ab.id,
          tipo: 'egreso',
          origen: 'orden_compra',
          fecha: ab.fecha,
          monto,
          descripcion: baseDesc,
          referencia: ref,
          metodoPago: ab.metodoPago?.nombre || 'No especificado',
          entidad: ab.ordenCompra?.proveedor?.nombre || 'Sin proveedor',
          usuario: ab.registradoPor?.nombre || '—',
        });
      }

      // Expenses - OC saldos pendientes (compromiso)
      const cxpDashboard = await prisma.cuentaPorPagar.findMany({
        where: {
          saldo: { gt: 0.01 },
          ordenCompra: {
            estado: { in: ['aprobada', 'parcialmente_recibida'] },
            fecha: { gte: desdeDate, lte: hastaLimit },
          },
        },
        include: {
          ordenCompra: { include: { proveedor: true } },
        },
      });
      for (const cxp of cxpDashboard) {
        const saldo = Number(cxp.saldo);
        const oc = cxp.ordenCompra;
        if (!oc) continue;
        totalEgresos += saldo;
        recentMovements.push({
          id: `cxp-saldo-${cxp.id}`,
          tipo: 'egreso',
          origen: 'cuenta_por_pagar',
          fecha: oc.fecha,
          monto: saldo,
          descripcion: `Saldo pendiente OC ${oc.numero}`,
          referencia: `Total $${Number(cxp.montoTotal).toFixed(2)}`,
          metodoPago: 'Cuenta por pagar',
          entidad: oc.proveedor?.nombre || 'Sin proveedor',
          usuario: '—',
        });
      }

      // Sort and slice top 5
      recentMovements.sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
      const top5Movements = recentMovements.slice(0, 5);

      return res.status(200).json({
        success: true,
        data: {
          periodo: {
            desde: desdeDate,
            hasta: hastaLimit
          },
          kpi: {
            ingresos: totalIngresos,
            egresos: totalEgresos,
            balance: totalIngresos - totalEgresos,
            proformasTotal: proformas.length,
            proformasMonto: totalFacturado,
            porAprobar: porAprobarCount,
            rechazadas: rechazadasCount,
            aprobadas: aprobadasCount,
            pagadas: pagadasCount,
            proyectosActivos: proyectos.filter(p => p.estado === 'ACTIVO').length
          },
          usersActivity,
          currentPrintingJob,
          printQueue,
          proyectosActivos: proyectos,
          proyectosFaseCount,
          recentMovements: top5Movements
        }
      });
    } catch (error) {
      console.error('[reportes/dashboard-summary]', error);
      return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al generar resumen consolidado del dashboard' } });
    }
  }
}
