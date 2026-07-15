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

async function nextIngresoId(): Promise<string> {
  const rows = await prisma.ingreso.findMany({ select: { id: true } });
  const max = rows.reduce((m, r) => {
    const match = String(r.id).match(/^ING-(\d+)$/);
    if (match) {
      const n = parseInt(match[1], 10);
      return Number.isFinite(n) && n > m ? n : m;
    }
    return m;
  }, 0);
  return `ING-${String(max + 1).padStart(3, '0')}`;
}

async function nextTransferenciaId(): Promise<string> {
  const rows = await prisma.transferencia.findMany({ select: { id: true } });
  const max = rows.reduce((m, r) => {
    const match = String(r.id).match(/^TRF-(\d+)$/);
    if (match) {
      const n = parseInt(match[1], 10);
      return Number.isFinite(n) && n > m ? n : m;
    }
    return m;
  }, 0);
  return `TRF-${String(max + 1).padStart(3, '0')}`;
}

/**
 * Checks if a given date falls within any closed cash-register period.
 * Returns the overlapping CierreCaja record or null.
 */
async function findCierreThatCovers(fecha: Date) {
  const d = new Date(fecha);
  d.setHours(0, 0, 0, 0);
  const dEnd = new Date(d);
  dEnd.setHours(23, 59, 59, 999);

  return prisma.cierreCaja.findFirst({
    where: {
      fechaInicio: { lte: dEnd },
      fechaFin: { gte: d },
    },
  });
}

function isAdminUser(req: any): boolean {
  const rol = ((req as any).user?.rol || '').toLowerCase();
  return rol === 'admin' || rol === 'administrador';
}

export class GastosController {
  // --- GASTOS CRUD ---

  async list(req: Request, res: Response): Promise<Response> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 25;
      const search = (req.query.search as string || '').toLowerCase();
      const origenFiltro = req.query.origen as string || 'todos';
      const usuarioIdFiltro = req.query.usuarioId as string || '';
      const metodoPagoIdFiltro = req.query.metodoPagoId as string || '';
      const startDateFiltro = req.query.startDate as string || '';
      const endDateFiltro = req.query.endDate as string || '';

      const [gastos, abonosCompra, nominas, anticipos] = await Promise.all([
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
      ]);

      const gastosManual = gastos.map((g) => {
        const isVehiculo = g.categoria?.toLowerCase() === 'vehiculos' || g.categoria?.toLowerCase() === 'mantenimiento';
        let conceptoFinal = g.concepto;
        if (isVehiculo) {
          const match = g.concepto.match(/Vehículo:\s*(.+?)(?:\s*\([^)]+\)|$)/i);
          const placa = match ? match[1].trim() : (g.proveedor || 'Vehículo');
          conceptoFinal = `[${placa}] ${g.concepto}`;
        }
        return {
          id: g.id,
          concepto: conceptoFinal,
          categoria: g.categoria,
          fecha: g.fecha,
          monto: Number(g.monto),
          proveedor: g.proveedor,
          notas: g.notas,
          metodoPagoId: g.metodoPagoId,
          metodoPago: g.metodoPago,
          registradoPor: g.registradoPor,
          origen: isVehiculo ? 'vehiculo' : 'otros_gastos',
          readonly: isVehiculo,
          referencia: '',
        };
      });

      const pagosCompra = abonosCompra.map((ab) => {
        const ref = ab.referencia || '';
        return {
          id: ab.id,
          concepto: `Abono OC: ${ab.ordenCompra?.numero || ''} ${ref ? '- ' + ref : ''}`.trim(),
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
        };
      });

      const pagosNomina: any[] = [];
      nominas.forEach((n) => {
        const abonosRaw = n.abonos as any;
        const abonosArr = Array.isArray(abonosRaw) ? abonosRaw : typeof abonosRaw === 'string' ? JSON.parse(abonosRaw) : [];
        if (abonosArr && abonosArr.length > 0) {
          abonosArr.forEach((ab: any, index: number) => {
            const startDate = new Date(n.fechaInicio);
            const startDay = startDate.getDate();
            const startMonth = startDate.toLocaleString('es-EC', { month: 'long' });
            const startYear = startDate.getFullYear();
            const quincenaText = startDay <= 15 ? '1era' : '2da';
            
            pagosNomina.push({
              id: `nomina-abono-${n.id}-${index}`,
              concepto: `Abono a Empleado ${n.empleado?.nombre || 'Sin nombre'} [${quincenaText} Quincena de ${startMonth} del ${startYear}]`,
              categoria: 'recursos_humanos',
              fecha: ab.fecha ? new Date(ab.fecha) : n.updatedAt,
              monto: Number(ab.monto || 0),
              proveedor: 'Personal',
              notas: ab.referencia || '',
              metodoPagoId: ab.metodoPagoId || null,
              metodoPago: null,
              registradoPor: null,
              origen: 'nomina' as const,
              readonly: true,
              referencia: ab.referencia || '',
            });
          });
        }
      });

      const anticiposEmpleados = anticipos.map((ant) => ({
        id: ant.id,
        concepto: `Abono a Empleado ${ant.empleado?.nombre || 'Sin nombre'} [Anticipo]`,
        categoria: 'recursos_humanos',
        fecha: ant.fecha,
        monto: Number(ant.monto),
        proveedor: 'Personal',
        notas: ant.motivo || 'Anticipo registrado en RRHH',
        metodoPagoId: null,
        metodoPago: null,
        registradoPor: null,
        origen: 'nomina' as const,
        readonly: true,
        referencia: '',
      }));

      let filteredData = [...gastosManual, ...pagosCompra, ...pagosNomina, ...anticiposEmpleados].sort(
        (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime(),
      );

      // Filtering by origen
      if (origenFiltro !== 'todos') {
        filteredData = filteredData.filter((g) => g.origen === origenFiltro);
      }

      // Filtering by usuario
      if (usuarioIdFiltro) {
        filteredData = filteredData.filter((g) => (g as any).registradoPor?.id === usuarioIdFiltro);
      }

      // Filtering by metodoPago
      if (metodoPagoIdFiltro) {
        filteredData = filteredData.filter((g) => g.metodoPagoId === metodoPagoIdFiltro);
      }

      // Filtering by dates
      if (startDateFiltro) {
        const d = new Date(startDateFiltro);
        d.setHours(0,0,0,0);
        filteredData = filteredData.filter((g) => new Date(g.fecha) >= d);
      }
      if (endDateFiltro) {
        const d = new Date(endDateFiltro);
        d.setHours(23,59,59,999);
        filteredData = filteredData.filter((g) => new Date(g.fecha) <= d);
      }

      // Filtering by search query
      if (search) {
        filteredData = filteredData.filter((g) =>
          g.concepto?.toLowerCase().includes(search) ||
          g.proveedor?.toLowerCase().includes(search) ||
          g.referencia?.toLowerCase().includes(search) ||
          g.notas?.toLowerCase().includes(search)
        );
      }

      // Calculate totals
      const sumMontos = (list: any[]) => list.reduce((s, g) => s + Number(g.monto?.toString() || 0), 0);
      const totalMonto = sumMontos(filteredData);
      const totalOtrosGastos = sumMontos(filteredData.filter(g => g.origen === 'otros_gastos'));
      const totalNomina = sumMontos(filteredData.filter(g => g.origen === 'nomina'));
      const totalVehiculos = sumMontos(filteredData.filter(g => g.origen === 'vehiculo'));
      const totalOC = sumMontos(filteredData.filter(g => g.origen === 'orden_compra'));

      // Pagination
      const totalCount = filteredData.length;
      const totalPages = Math.ceil(totalCount / limit);
      const data = filteredData.slice((page - 1) * limit, page * limit);

      return res.status(200).json({ 
        success: true, 
        data,
        totales: {
          total: totalMonto,
          otrosGastos: totalOtrosGastos,
          nomina: totalNomina,
          vehiculos: totalVehiculos,
          ordenesCompra: totalOC
        },
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

      // Verificar si la fecha cae en un período cerrado
      const cierreBloqueante = await findCierreThatCovers(new Date(b.fecha));
      if (cierreBloqueante) {
        const fi = cierreBloqueante.fechaInicio.toISOString().split('T')[0];
        const ff = cierreBloqueante.fechaFin.toISOString().split('T')[0];
        return res.status(403).json({ success: false, error: { code: 'PERIODO_CERRADO', message: `No se pueden registrar gastos en un período cerrado (${fi} al ${ff}). Elimine el cierre de caja primero.` } });
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

      // Verificar si la fecha cae en un período cerrado
      const cierreBloqueante = await findCierreThatCovers(new Date(b.fecha));
      if (cierreBloqueante) {
        const fi = cierreBloqueante.fechaInicio.toISOString().split('T')[0];
        const ff = cierreBloqueante.fechaFin.toISOString().split('T')[0];
        return res.status(403).json({ success: false, error: { code: 'PERIODO_CERRADO', message: `No se pueden editar gastos en un período cerrado (${fi} al ${ff}). Elimine el cierre de caja primero.` } });
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

      // Verificar si el gasto cae en un período cerrado
      const gastoExistente = await prisma.gasto.findUnique({ where: { id: String(id) } });
      if (gastoExistente) {
        const cierreBloqueante = await findCierreThatCovers(gastoExistente.fecha);
        if (cierreBloqueante) {
          const fi = cierreBloqueante.fechaInicio.toISOString().split('T')[0];
          const ff = cierreBloqueante.fechaFin.toISOString().split('T')[0];
          return res.status(403).json({ success: false, error: { code: 'PERIODO_CERRADO', message: `No se pueden eliminar gastos en un período cerrado (${fi} al ${ff}). Elimine el cierre de caja primero.` } });
        }
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

      // 1.5 Obtener ingresos manuales de caja
      const ingresosManuales = await prisma.ingreso.findMany({
        where: {
          fecha: { gte: desdeDate, lte: hastaLimit },
        },
        include: {
          metodoPago: true,
          registradoPor: { select: { id: true, nombre: true } }
        }
      });

      // 1.6 Obtener transferencias entre cuentas
      const transferencias = await prisma.transferencia.findMany({
        where: {
          fecha: { gte: desdeDate, lte: hastaLimit }
        },
        include: {
          origenMetodo: true,
          destinoMetodo: true,
        }
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

      for (const ing of ingresosManuales) {
        const total = Number(ing.monto);
        totalIngresos += total;

        const methodId = ing.metodoPagoId || 'no_especificado';
        const methodName = ing.metodoPago?.nombre || 'No especificado';
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

      // Registrar transferencias internas en los desgloses de cuentas individuales
      for (const t of transferencias) {
        const monto = Number(t.monto);
        
        // Destino (Ingreso)
        const destId = t.destinoMetodoId;
        const destName = t.destinoMetodo?.nombre || 'Destino no especificado';
        if (!ingresosDetalle[destId]) {
          ingresosDetalle[destId] = { id: destId, nombre: destName, total: 0 };
        }
        ingresosDetalle[destId].total += monto;

        // Origen (Egreso)
        const origId = t.origenMetodoId;
        const origName = t.origenMetodo?.nombre || 'Origen no especificado';
        if (!egresosDetalle[origId]) {
          egresosDetalle[origId] = { id: origId, nombre: origName, total: 0 };
        }
        egresosDetalle[origId].total += monto;
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

      // 4. Segmentación por Secciones de Ingresos (Abonos Iniciales vs Posteriores)
      let abonosInicialesSum = 0;
      let abonosPosterioresSum = 0;
      let ingresosManualesSum = 0;

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

      for (const ing of ingresosManuales) {
        ingresosManualesSum += Number(ing.monto);
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
      for (const ing of ingresosManuales) {
        addUsuarioTx(ing.registradoPorUserId, ing.registradoPor?.nombre || 'No especificado', Number(ing.monto), 'ingreso');
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
          ingresosConteo: abonosProforma.length + ingresosManuales.length,
          egresosConteo: gastos.length + abonos.length,

          // Secciones de Ingresos
          seccionIngresos: {
            abonosIniciales: abonosInicialesSum,
            abonosPosteriores: abonosPosterioresSum,
            otrosIngresos: ingresosManualesSum,
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

      // Verificar que no exista un cierre que se solape con este rango
      const fi = new Date(String(b.fechaInicio).includes('T') ? b.fechaInicio : b.fechaInicio + 'T00:00:00');
      const ff = new Date(String(b.fechaFin).includes('T') ? b.fechaFin : b.fechaFin + 'T23:59:59.999');
      const solapado = await prisma.cierreCaja.findFirst({
        where: {
          fechaInicio: { lte: ff },
          fechaFin: { gte: fi },
        },
      });
      if (solapado) {
        const si = solapado.fechaInicio.toISOString().split('T')[0];
        const sf = solapado.fechaFin.toISOString().split('T')[0];
        return res.status(400).json({ success: false, error: { code: 'CIERRE_DUPLICADO', message: `Ya existe un cierre de caja que cubre el rango ${si} al ${sf}. Elimínelo primero si desea volver a cerrar.` } });
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

  async removeCierre(req: Request, res: Response): Promise<Response> {
    try {
      if (!isAdminUser(req)) {
        return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Solo los administradores pueden eliminar cierres de caja.' } });
      }

      const { id } = req.params;
      const cierre = await prisma.cierreCaja.findUnique({ where: { id: String(id) } });
      if (!cierre) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Cierre de caja no encontrado.' } });
      }

      await prisma.cierreCaja.delete({ where: { id: String(id) } });
      return res.status(200).json({ success: true, data: { id } });
    } catch (error) {
      console.error('[cierre/remove]', error);
      return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al eliminar cierre de caja' } });
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
        origen: 'proforma' | 'gasto' | 'orden_compra' | 'cuenta_por_pagar' | 'pago_nomina' | 'anticipo_empleado' | 'ingreso_manual' | 'transferencia';
        fecha: Date;
        monto: number;
        descripcion: string;
        referencia: string;
        metodoPago: string;
        metodoPagoId: string | null;
        entidad: string;
        usuario: string;
        categoria?: string;
        esCompromiso?: boolean;
        ordenTotal?: number | null;
        ordenSaldo?: number | null;
        esPagoAjuste?: boolean;
      }

      const movimientos: Movimiento[] = [];

      // 1. INGRESOS — AbonoProforma Y Ingreso Manual
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
            categoria: 'Ingresos Proforma',
          });
        }

        // Ingresos manuales
        const whereIngresoManual: any = {
          fecha: { gte: desdeDate, lte: hastaLimit },
        };
        if (metodoPagoId) whereIngresoManual.metodoPagoId = String(metodoPagoId);

        const ingresosManuales = await prisma.ingreso.findMany({
          where: whereIngresoManual,
          include: {
            metodoPago: true,
            registradoPor: { select: { nombre: true } },
          },
          orderBy: { fecha: 'desc' },
        });

        for (const ing of ingresosManuales) {
          const combinedFecha = new Date(ing.fecha);
          if (ing.createdAt) {
            const timeRef = new Date(ing.createdAt);
            combinedFecha.setUTCHours(timeRef.getUTCHours(), timeRef.getUTCMinutes(), timeRef.getUTCSeconds(), timeRef.getUTCMilliseconds());
          }

          movimientos.push({
            id: ing.id,
            tipo: 'ingreso',
            origen: 'ingreso_manual',
            fecha: combinedFecha,
            monto: Number(ing.monto),
            descripcion: ing.concepto,
            referencia: ing.notas || '',
            metodoPago: ing.metodoPago?.nombre || 'No especificado',
            metodoPagoId: ing.metodoPagoId,
            entidad: ing.cliente || ing.categoria || 'Ingreso manual',
            usuario: ing.registradoPor?.nombre || '—',
            categoria: ing.categoria || 'Otros Ingresos',
          });
        }
      }

      // 1.7 TRANSFERENCIAS entre cuentas (afectan origen como egreso y destino como ingreso)
      const whereTransferencia: any = {
        fecha: { gte: desdeDate, lte: hastaLimit },
      };
      
      if (metodoPagoId) {
        whereTransferencia.OR = [
          { origenMetodoId: String(metodoPagoId) },
          { destinoMetodoId: String(metodoPagoId) },
        ];
      }

      const transferencias = await prisma.transferencia.findMany({
        where: whereTransferencia,
        include: {
          origenMetodo: true,
          destinoMetodo: true,
          registradoPor: { select: { nombre: true } },
        },
        orderBy: { fecha: 'desc' },
      });

      for (const t of transferencias) {
        const combinedFecha = new Date(t.fecha);
        if (t.createdAt) {
          const timeRef = new Date(t.createdAt);
          combinedFecha.setUTCHours(timeRef.getUTCHours(), timeRef.getUTCMinutes(), timeRef.getUTCSeconds(), timeRef.getUTCMilliseconds());
        }

        if (metodoPagoId) {
          const isOrigin = t.origenMetodoId === String(metodoPagoId);
          const isDest = t.destinoMetodoId === String(metodoPagoId);
          
          if (isOrigin && (!tipo || tipo === 'todos' || tipo === 'egreso')) {
            movimientos.push({
              id: `${t.id}-egreso`,
              tipo: 'egreso',
              origen: 'transferencia',
              fecha: combinedFecha,
              monto: Number(t.monto),
              descripcion: `Transferencia enviada a ${t.destinoMetodo?.nombre || 'Cuenta Destino'}`,
              referencia: t.referencia || '',
              metodoPago: t.origenMetodo?.nombre || 'No especificado',
              metodoPagoId: t.origenMetodoId,
              entidad: 'Transferencia interna',
              usuario: t.registradoPor?.nombre || '—',
              categoria: 'Transferencias',
            });
          }
          if (isDest && (!tipo || tipo === 'todos' || tipo === 'ingreso')) {
            movimientos.push({
              id: `${t.id}-ingreso`,
              tipo: 'ingreso',
              origen: 'transferencia',
              fecha: combinedFecha,
              monto: Number(t.monto),
              descripcion: `Transferencia recibida de ${t.origenMetodo?.nombre || 'Cuenta Origen'}`,
              referencia: t.referencia || '',
              metodoPago: t.destinoMetodo?.nombre || 'No especificado',
              metodoPagoId: t.destinoMetodoId,
              entidad: 'Transferencia interna',
              usuario: t.registradoPor?.nombre || '—',
              categoria: 'Transferencias',
            });
          }
        } else {
          if (!tipo || tipo === 'todos' || tipo === 'egreso') {
            movimientos.push({
              id: `${t.id}-egreso`,
              tipo: 'egreso',
              origen: 'transferencia',
              fecha: combinedFecha,
              monto: Number(t.monto),
              descripcion: `Transferencia enviada a ${t.destinoMetodo?.nombre || 'Cuenta Destino'}`,
              referencia: t.referencia || '',
              metodoPago: t.origenMetodo?.nombre || 'No especificado',
              metodoPagoId: t.origenMetodoId,
              entidad: 'Transferencia interna',
              usuario: t.registradoPor?.nombre || '—',
              categoria: 'Transferencias',
            });
          }
          if (!tipo || tipo === 'todos' || tipo === 'ingreso') {
            movimientos.push({
              id: `${t.id}-ingreso`,
              tipo: 'ingreso',
              origen: 'transferencia',
              fecha: combinedFecha,
              monto: Number(t.monto),
              descripcion: `Transferencia recibida de ${t.origenMetodo?.nombre || 'Cuenta Origen'}`,
              referencia: t.referencia || '',
              metodoPago: t.destinoMetodo?.nombre || 'No especificado',
              metodoPagoId: t.destinoMetodoId,
              entidad: 'Transferencia interna',
              usuario: t.registradoPor?.nombre || '—',
              categoria: 'Transferencias',
            });
          }
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
          const combinedFecha = new Date(g.fecha);
          if (g.createdAt) {
            const timeRef = new Date(g.createdAt);
            combinedFecha.setUTCHours(timeRef.getUTCHours(), timeRef.getUTCMinutes(), timeRef.getUTCSeconds(), timeRef.getUTCMilliseconds());
          }

          movimientos.push({
            id: g.id,
            tipo: 'egreso',
            origen: 'gasto',
            fecha: combinedFecha,
            monto: Number(g.monto),
            descripcion: g.concepto,
            referencia: g.notas || '',
            metodoPago: g.metodoPago?.nombre || 'No especificado',
            metodoPagoId: g.metodoPagoId,
            entidad: g.proveedor || g.categoria || '',
            usuario: g.registradoPor?.nombre || '—',
            categoria: g.categoria || 'Varios',
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
            categoria: 'Compras',
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
            categoria: 'Nómina y Anticipos',
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
                  categoria: 'Nómina y Anticipos',
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
        select: { 
          id: true, 
          nombre: true, 
          username: true, 
          rol: true, 
          empleadoId: true,
          empleado: { select: { foto: true } }
        }
      });

      const userIds = dbUsers.map(u => u.id);
      const latestTaskByUser: Record<string, { id: string; titulo: string; estado: string; prioridad: string } | null> = {};
      const lastActionByUser: Record<string, { fecha: Date; accion: string; modulo: string; detalle: string } | null> = {};
      const taskCountByUser: Record<string, number> = {};

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
          taskCountByUser[uid] = (taskCountByUser[uid] || 0) + 1;
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
        foto: u.empleado?.foto || null,
        activeTask: latestTaskByUser[u.id] || null,
        pendingTasksCount: taskCountByUser[u.id] || 0,
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
        select: { id: true, nombre: true, faseActual: true, progreso: true, estado: true, clienteNombre: true, responsable: true, requiereInstalacion: true }
      });

      // Calcular dinero pendiente de cobro de proformas (Aprobadas)
      const approvedProformas = await prisma.proforma.findMany({
        where: { estado: 'Aprobada' },
        include: { items: true, abonos: true }
      });
      let totalProformasPendienteCobro = 0;
      for (const prof of approvedProformas) {
        const sub = prof.items.reduce((s, item) => s + Number(item.cantidad || 0) * Number(item.precioUnitario || 0), 0);
        const total = sub * (1 + Number(prof.iva || 0.12));
        const totalAbonos = prof.abonos.reduce((s, ab) => s + Number(ab.monto), 0);
        const saldo = total - totalAbonos;
        if (saldo > 0.01) {
          totalProformasPendienteCobro += saldo;
        }
      }

      // Calcular dinero pendiente de cuentas por pagar
      const allCxPPendientes = await prisma.cuentaPorPagar.findMany({
        where: { saldo: { gt: 0.01 } },
        select: { saldo: true }
      });
      const totalCxPPendientes = allCxPPendientes.reduce((sum, c) => sum + Number(c.saldo), 0);

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

      const dbIngresos = await prisma.ingreso.findMany({
        where: { fecha: { gte: desdeDate, lte: hastaLimit } },
        include: {
          metodoPago: true,
          registradoPor: { select: { nombre: true } },
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
        origen: 'proforma' | 'gasto' | 'orden_compra' | 'cuenta_por_pagar' | 'ingreso_manual';
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

      // Manual Incomes
      for (const ing of dbIngresos) {
        const monto = Number(ing.monto);
        totalIngresos += monto;
        recentMovements.push({
          id: ing.id,
          tipo: 'ingreso',
          origen: 'ingreso_manual',
          fecha: ing.fecha,
          monto,
          descripcion: ing.concepto,
          referencia: ing.notas || '',
          metodoPago: ing.metodoPago?.nombre || 'No especificado',
          entidad: ing.cliente || ing.categoria || 'Otros',
          usuario: ing.registradoPor?.nombre || '—',
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

      // 1. Previous period metrics for trend analysis
      const rangeMs = hastaLimit.getTime() - desdeDate.getTime();
      const desdePrevDate = new Date(desdeDate.getTime() - rangeMs);
      const hastaPrevDate = new Date(desdeDate.getTime() - 1);

      const prevAbonosProforma = await prisma.abonoProforma.findMany({
        where: { fecha: { gte: desdePrevDate, lte: hastaPrevDate } },
        select: { monto: true }
      });
      const prevIngresos = await prisma.ingreso.findMany({
        where: { fecha: { gte: desdePrevDate, lte: hastaPrevDate } },
        select: { monto: true }
      });
      const totalIngresosPrev = prevAbonosProforma.reduce((sum, ab) => sum + Number(ab.monto), 0) + prevIngresos.reduce((sum, ab) => sum + Number(ab.monto), 0);

      const prevGastos = await prisma.gasto.findMany({
        where: { fecha: { gte: desdePrevDate, lte: hastaPrevDate } },
        select: { monto: true }
      });
      const totalGastosPrev = prevGastos.reduce((sum, g) => sum + Number(g.monto), 0);

      const prevAbonosCompra = await prisma.abonoCompra.findMany({
        where: { fecha: { gte: desdePrevDate, lte: hastaPrevDate } },
        select: { monto: true }
      });
      const totalAbonosCompraPrev = prevAbonosCompra.reduce((sum, ab) => sum + Number(ab.monto), 0);

      const prevCxP = await prisma.cuentaPorPagar.findMany({
        where: {
          ordenCompra: {
            fecha: { gte: desdePrevDate, lte: hastaPrevDate }
          }
        },
        select: { saldo: true }
      });
      const totalCxPPrev = prevCxP.reduce((sum, c) => sum + Number(c.saldo), 0);

      const totalEgresosPrev = totalGastosPrev + totalAbonosCompraPrev + totalCxPPrev;
      const balancePrev = totalIngresosPrev - totalEgresosPrev;

      const prevProformas = await prisma.proforma.findMany({
        where: { fecha: { gte: desdePrevDate, lte: hastaPrevDate }, estado: 'Aprobada' },
        include: { items: true, abonos: true }
      });
      let totalProformasPendienteCobroPrev = 0;
      for (const prof of prevProformas) {
        const sub = prof.items.reduce((s, item) => s + Number(item.cantidad || 0) * Number(item.precioUnitario || 0), 0);
        const total = sub * (1 + Number(prof.iva || 0.12));
        const totalAbonos = prof.abonos.reduce((s, ab) => s + Number(ab.monto), 0);
        const saldo = total - totalAbonos;
        if (saldo > 0.01) {
          totalProformasPendienteCobroPrev += saldo;
        }
      }

      const pctChange = (curr: number, prev: number) => {
        if (prev === 0) return curr > 0 ? 100 : 0;
        return Number((((curr - prev) / prev) * 100).toFixed(1));
      };

      const changeBalance = pctChange(totalIngresos - totalEgresos, balancePrev);
      const changeIngresos = pctChange(totalIngresos, totalIngresosPrev);
      const changeEgresos = pctChange(totalEgresos, totalEgresosPrev);
      const changeProformasPendienteCobro = pctChange(totalProformasPendienteCobro, totalProformasPendienteCobroPrev);
      const changeCxPPendientes = pctChange(totalCxPPendientes, totalCxPPrev);

      // 2. Daily Data for Flow Chart & Sparklines
      const dailyDataMap: Record<string, { ingresos: number; egresos: number; balance: number }> = {};
      let cur = new Date(desdeDate);
      while (cur <= hastaLimit) {
        const dayKey = cur.toISOString().split('T')[0];
        dailyDataMap[dayKey] = { ingresos: 0, egresos: 0, balance: 0 };
        cur.setDate(cur.getDate() + 1);
      }

      for (const ab of abonosProforma) {
        const dayKey = ab.fecha.toISOString().split('T')[0];
        if (dailyDataMap[dayKey]) {
          dailyDataMap[dayKey].ingresos += Number(ab.monto);
        }
      }
      for (const ing of dbIngresos) {
        const dayKey = ing.fecha.toISOString().split('T')[0];
        if (dailyDataMap[dayKey]) {
          dailyDataMap[dayKey].ingresos += Number(ing.monto);
        }
      }
      for (const g of dbGastos) {
        const dayKey = g.fecha.toISOString().split('T')[0];
        if (dailyDataMap[dayKey]) {
          dailyDataMap[dayKey].egresos += Number(g.monto);
        }
      }
      for (const ab of abonosCompra) {
        const dayKey = ab.fecha.toISOString().split('T')[0];
        if (dailyDataMap[dayKey]) {
          dailyDataMap[dayKey].egresos += Number(ab.monto);
        }
      }
      for (const cxp of cxpDashboard) {
        const dayKey = cxp.ordenCompra?.fecha.toISOString().split('T')[0];
        if (dayKey && dailyDataMap[dayKey]) {
          dailyDataMap[dayKey].egresos += Number(cxp.saldo);
        }
      }

      const dailyData = Object.entries(dailyDataMap).map(([fecha, val]) => ({
        fecha,
        ingresos: val.ingresos,
        egresos: val.egresos,
        balance: val.ingresos - val.egresos
      })).sort((a, b) => a.fecha.localeCompare(b.fecha));

      // 3. Egresos Breakdown by Category (Distribución de Egresos)
      const egresosPorCategoria: Record<string, number> = {};
      for (const g of dbGastos) {
        const category = g.categoria || 'Otros';
        const monto = Number(g.monto);
        egresosPorCategoria[category] = (egresosPorCategoria[category] || 0) + monto;
      }
      const ocTotal = abonosCompra.reduce((sum, ab) => sum + Number(ab.monto), 0) + cxpDashboard.reduce((sum, cxp) => sum + Number(cxp.saldo), 0);
      if (ocTotal > 0) {
        egresosPorCategoria['Compras'] = (egresosPorCategoria['Compras'] || 0) + ocTotal;
      }

      const totalEgresosCalculado = Object.values(egresosPorCategoria).reduce((a, b) => a + b, 0);
      const egresosDistribucion = Object.entries(egresosPorCategoria).map(([categoria, valor]) => ({
        categoria: categoria.charAt(0).toUpperCase() + categoria.slice(1),
        valor,
        porcentaje: totalEgresosCalculado > 0 ? Number(((valor / totalEgresosCalculado) * 100).toFixed(1)) : 0
      })).sort((a, b) => b.valor - a.valor);

      // 4. Quick Summary Counts
      const ocsPendientesCount = await prisma.ordenCompra.count({
        where: {
          OR: [
            { estado: 'pendiente_aprobacion' },
            { estadoPago: { in: ['sin_pagar', 'pago_parcial'] } }
          ]
        }
      });
      const proformasAprobadasCount = await prisma.proforma.count({
        where: { estado: 'Aprobada' }
      });
      const tareasPendientesCount = await prisma.tarea.count({
        where: { estado: { in: ['pendiente', 'en_progreso'] } }
      });

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
            proyectosActivos: proyectos.filter(p => p.estado === 'ACTIVO').length,
            totalProformasPendienteCobro,
            totalCxPPendientes,
            changeBalance,
            changeIngresos,
            changeEgresos,
            changeProformasPendienteCobro,
            changeCxPPendientes
          },
          usersActivity,
          currentPrintingJob,
          printQueue,
          proyectosActivos: proyectos,
          proformas: proformas.map(p => {
            const sub = p.items.reduce((s, item) => s + Number(item.cantidad || 0) * Number(item.precioUnitario || 0), 0);
            const total = sub * (1 + Number(p.iva || 0.12));
            return {
              id: p.id,
              fecha: p.fecha.toISOString().split('T')[0],
              clienteNombre: p.clienteNombre,
              estado: p.estado,
              total
            };
          }),
          proyectosFaseCount,
          recentMovements: top5Movements,
          dailyData,
          egresosDistribucion,
          quickSummary: {
            ocsPendientes: ocsPendientesCount,
            proformasAprobadas: proformasAprobadasCount,
            tareasPendientes: tareasPendientesCount
          }
        }
      });
    } catch (error) {
      console.error('[reportes/dashboard-summary]', error);
      return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al generar resumen consolidado del dashboard' } });
    }
  }

  // --- INGRESO MANUAL CRUD ---

  async listIngresos(req: Request, res: Response): Promise<Response> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 25;
      const search = (req.query.search as string || '').toLowerCase();
      const metodoPagoIdFiltro = req.query.metodoPagoId as string || '';
      const startDateFiltro = req.query.startDate as string || '';
      const endDateFiltro = req.query.endDate as string || '';

      const where: any = {};
      if (metodoPagoIdFiltro) where.metodoPagoId = metodoPagoIdFiltro;
      
      if (startDateFiltro || endDateFiltro) {
        where.fecha = {};
        if (startDateFiltro) where.fecha.gte = new Date(startDateFiltro);
        if (endDateFiltro) where.fecha.lte = new Date(endDateFiltro + 'T23:59:59.999');
      }

      if (search) {
        where.OR = [
          { concepto: { contains: search, mode: 'insensitive' } },
          { notas: { contains: search, mode: 'insensitive' } },
          { cliente: { contains: search, mode: 'insensitive' } },
        ];
      }

      const [ingresos, totalCount] = await Promise.all([
        prisma.ingreso.findMany({
          where,
          include: {
            metodoPago: true,
            registradoPor: { select: { id: true, nombre: true } },
          },
          orderBy: { fecha: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.ingreso.count({ where }),
      ]);

      const data = ingresos.map(ing => ({
        ...ing,
        monto: Number(ing.monto),
      }));

      return res.status(200).json({
        success: true,
        data,
        pagination: { totalCount, totalPages: Math.ceil(totalCount / limit), currentPage: page, limit }
      });
    } catch (error) {
      console.error('[ingresos/list]', error);
      return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al obtener ingresos' } });
    }
  }

  async createIngreso(req: Request, res: Response): Promise<Response> {
    try {
      const b = req.body || {};
      if (!b.concepto || !b.fecha || b.monto === undefined || !b.metodoPagoId) {
        return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Concepto, fecha, monto y método de pago son requeridos' } });
      }

      // Verificar si la fecha cae en un período cerrado
      const cierreBloqueante = await findCierreThatCovers(new Date(b.fecha));
      if (cierreBloqueante) {
        const fi = cierreBloqueante.fechaInicio.toISOString().split('T')[0];
        const ff = cierreBloqueante.fechaFin.toISOString().split('T')[0];
        return res.status(403).json({ success: false, error: { code: 'PERIODO_CERRADO', message: `No se pueden registrar ingresos en un período cerrado (${fi} al ${ff}). Elimine el cierre de caja primero.` } });
      }

      const id = await nextIngresoId();
      const registradoPorUserId = (req as { user?: { id?: string } }).user?.id || null;

      const ingreso = await prisma.ingreso.create({
        data: {
          id,
          concepto: b.concepto,
          categoria: b.categoria ?? 'Otros',
          fecha: new Date(b.fecha),
          monto: Number(b.monto),
          cliente: b.cliente ?? '',
          notas: b.notas ?? '',
          metodoPagoId: b.metodoPagoId,
          registradoPorUserId,
        },
        include: { metodoPago: true },
      });

      return res.status(201).json({ success: true, data: { ...ingreso, monto: Number(ingreso.monto) } });
    } catch (error) {
      console.error('[ingresos/create]', error);
      return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al registrar ingreso' } });
    }
  }

  async updateIngreso(req: Request, res: Response): Promise<Response> {
    try {
      const { id } = req.params;
      const b = req.body || {};

      if (!b.concepto || !b.fecha || b.monto === undefined || !b.metodoPagoId) {
        return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Concepto, fecha, monto y método de pago son requeridos' } });
      }

      // Verificar si la fecha cae en un período cerrado
      const cierreBloqueante = await findCierreThatCovers(new Date(b.fecha));
      if (cierreBloqueante) {
        const fi = cierreBloqueante.fechaInicio.toISOString().split('T')[0];
        const ff = cierreBloqueante.fechaFin.toISOString().split('T')[0];
        return res.status(403).json({ success: false, error: { code: 'PERIODO_CERRADO', message: `No se pueden editar ingresos en un período cerrado (${fi} al ${ff}).` } });
      }

      // Verificar el ingreso original también por si cambiaron de fecha a un periodo cerrado
      const existente = await prisma.ingreso.findUnique({ where: { id: String(id) } });
      if (!existente) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Ingreso no encontrado' } });
      }
      const cierreBloqueanteExistente = await findCierreThatCovers(existente.fecha);
      if (cierreBloqueanteExistente) {
        const fi = cierreBloqueanteExistente.fechaInicio.toISOString().split('T')[0];
        const ff = cierreBloqueanteExistente.fechaFin.toISOString().split('T')[0];
        return res.status(403).json({ success: false, error: { code: 'PERIODO_CERRADO', message: `No se pueden editar ingresos registrados originalmente en un período cerrado (${fi} al ${ff}).` } });
      }

      const ingreso = await prisma.ingreso.update({
        where: { id: String(id) },
        data: {
          concepto: b.concepto,
          categoria: b.categoria ?? 'Otros',
          fecha: new Date(b.fecha),
          monto: Number(b.monto),
          cliente: b.cliente ?? '',
          notas: b.notas ?? '',
          metodoPagoId: b.metodoPagoId,
        },
        include: { metodoPago: true },
      });

      return res.status(200).json({ success: true, data: { ...ingreso, monto: Number(ingreso.monto) } });
    } catch (error) {
      console.error('[ingresos/update]', error);
      return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al actualizar ingreso' } });
    }
  }

  async removeIngreso(req: Request, res: Response): Promise<Response> {
    try {
      const { id } = req.params;
      const existente = await prisma.ingreso.findUnique({ where: { id: String(id) } });
      if (!existente) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Ingreso no encontrado' } });
      }

      // Verificar si cae en un período cerrado
      const cierreBloqueante = await findCierreThatCovers(existente.fecha);
      if (cierreBloqueante) {
        const fi = cierreBloqueante.fechaInicio.toISOString().split('T')[0];
        const ff = cierreBloqueante.fechaFin.toISOString().split('T')[0];
        return res.status(403).json({ success: false, error: { code: 'PERIODO_CERRADO', message: `No se pueden eliminar ingresos en un período cerrado (${fi} al ${ff}).` } });
      }

      await prisma.ingreso.delete({ where: { id: String(id) } });
      return res.status(200).json({ success: true, data: { id } });
    } catch (error) {
      console.error('[ingresos/remove]', error);
      return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al eliminar ingreso' } });
    }
  }

  // --- TRANSFERENCIA CRUD ---

  async listTransferencias(req: Request, res: Response): Promise<Response> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 25;
      const search = (req.query.search as string || '').toLowerCase();
      const originId = req.query.origenMetodoId as string || '';
      const destId = req.query.destinoMetodoId as string || '';
      const startDateFiltro = req.query.startDate as string || '';
      const endDateFiltro = req.query.endDate as string || '';

      const where: any = {};
      if (originId) where.origenMetodoId = originId;
      if (destId) where.destinoMetodoId = destId;
      
      if (startDateFiltro || endDateFiltro) {
        where.fecha = {};
        if (startDateFiltro) where.fecha.gte = new Date(startDateFiltro);
        if (endDateFiltro) where.fecha.lte = new Date(endDateFiltro + 'T23:59:59.999');
      }

      if (search) {
        where.referencia = { contains: search, mode: 'insensitive' };
      }

      const [transferencias, totalCount] = await Promise.all([
        prisma.transferencia.findMany({
          where,
          include: {
            origenMetodo: true,
            destinoMetodo: true,
            registradoPor: { select: { id: true, nombre: true } },
          },
          orderBy: { fecha: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.transferencia.count({ where }),
      ]);

      const data = transferencias.map(t => ({
        ...t,
        monto: Number(t.monto),
      }));

      return res.status(200).json({
        success: true,
        data,
        pagination: { totalCount, totalPages: Math.ceil(totalCount / limit), currentPage: page, limit }
      });
    } catch (error) {
      console.error('[transferencias/list]', error);
      return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al obtener transferencias' } });
    }
  }

  async createTransferencia(req: Request, res: Response): Promise<Response> {
    try {
      const b = req.body || {};
      if (!b.origenMetodoId || !b.destinoMetodoId || b.monto === undefined || !b.fecha) {
        return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Cuenta origen, cuenta destino, monto y fecha son requeridos' } });
      }

      if (b.origenMetodoId === b.destinoMetodoId) {
        return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'La cuenta origen y destino deben ser diferentes' } });
      }

      if (Number(b.monto) <= 0) {
        return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'El monto de la transferencia debe ser mayor a cero' } });
      }

      // Verificar si la fecha cae en un período cerrado
      const cierreBloqueante = await findCierreThatCovers(new Date(b.fecha));
      if (cierreBloqueante) {
        const fi = cierreBloqueante.fechaInicio.toISOString().split('T')[0];
        const ff = cierreBloqueante.fechaFin.toISOString().split('T')[0];
        return res.status(403).json({ success: false, error: { code: 'PERIODO_CERRADO', message: `No se pueden registrar transferencias en un período cerrado (${fi} al ${ff}).` } });
      }

      const id = await nextTransferenciaId();
      const registradoPorUserId = (req as { user?: { id?: string } }).user?.id || null;

      const transferencia = await prisma.transferencia.create({
        data: {
          id,
          origenMetodoId: b.origenMetodoId,
          destinoMetodoId: b.destinoMetodoId,
          monto: Number(b.monto),
          fecha: new Date(b.fecha),
          referencia: b.referencia ?? '',
          registradoPorUserId,
        },
        include: { origenMetodo: true, destinoMetodo: true },
      });

      return res.status(201).json({ success: true, data: { ...transferencia, monto: Number(transferencia.monto) } });
    } catch (error) {
      console.error('[transferencias/create]', error);
      return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al registrar transferencia' } });
    }
  }

  async removeTransferencia(req: Request, res: Response): Promise<Response> {
    try {
      const { id } = req.params;
      const existente = await prisma.transferencia.findUnique({ where: { id: String(id) } });
      if (!existente) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Transferencia no encontrada' } });
      }

      // Verificar si cae en un período cerrado
      const cierreBloqueante = await findCierreThatCovers(existente.fecha);
      if (cierreBloqueante) {
        const fi = cierreBloqueante.fechaInicio.toISOString().split('T')[0];
        const ff = cierreBloqueante.fechaFin.toISOString().split('T')[0];
        return res.status(403).json({ success: false, error: { code: 'PERIODO_CERRADO', message: `No se pueden eliminar transferencias en un período cerrado (${fi} al ${ff}).` } });
      }

      await prisma.transferencia.delete({ where: { id: String(id) } });
      return res.status(200).json({ success: true, data: { id } });
    } catch (error) {
      console.error('[transferencias/remove]', error);
      return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al eliminar transferencia' } });
    }
  }

  async testDebug(req: Request, res: Response): Promise<Response> {
    try {
      // Trace exacta del cálculo para julio 2026
      const nominas = await prisma.nominaRegistro.findMany({
        where: {
          fechaInicio: { gte: new Date('2026-07-01'), lte: new Date('2026-07-31') },
          diasLaborados: { gt: 0 }
        },
        include: { empleado: { select: { nombre: true, cargo: true } } }
      });

      const trace = nominas.map(n => {
        const ingObj: any = n.ingresos ? (typeof n.ingresos === 'string' ? JSON.parse(n.ingresos as string) : n.ingresos) : {};
        const egrObj: any = n.egresos ? (typeof n.egresos === 'string' ? JSON.parse(n.egresos as string) : n.egresos) : {};

        const ingVal = Object.values(ingObj).reduce((sum: number, v: any) => sum + (typeof v === 'number' ? v : (typeof v === 'string' ? Number(v) || 0 : 0)), 0) as number;
        const egrVal = Object.values(egrObj).reduce((sum: number, v: any) => sum + (typeof v === 'number' ? v : (typeof v === 'string' ? Number(v) || 0 : 0)), 0) as number;
        const iessVal = Number(egrObj.iess) || 0;
        const neto = ingVal - egrVal;
        const netoPositivo = Math.max(0, neto);
        const costoLaboral = netoPositivo + iessVal;

        return {
          empleado: n.empleado?.nombre,
          diasLaborados: n.diasLaborados,
          sueldoDiario: (n as any).sueldoDiario,
          ingObj_raw: ingObj,
          egrObj_raw: egrObj,
          ingVal,
          egrVal,
          iessVal,
          neto,
          netoPositivo,
          costoLaboral,
          gastosPorMes_JUL: costoLaboral
        };
      });

      const totalGastosPorMesJUL = trace.reduce((s, t) => s + t.costoLaboral, 0);

      return res.status(200).json({
        success: true,
        descripcion: 'Traza exacta del cálculo gastosPorMes para Julio 2026',
        nominas_activas_julio: trace,
        total_gastosPorMes_JUL: totalGastosPorMesJUL
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  async getBalancesReport(req: Request, res: Response): Promise<Response> {
    try {
      const { desde, hasta } = req.query;

      // 1. Setup date ranges
      let desdeDate: Date | undefined;
      let hastaLimit: Date | undefined;

      if (desde) {
        const desdeStr = String(desde);
        // Use UTC midnight so @db.Date fields (stored as 2026-07-01T00:00:00Z) are included
        desdeDate = desdeStr.includes('T') ? new Date(desdeStr) : new Date(desdeStr + 'T00:00:00Z');
      }
      if (hasta) {
        const hastaStr = String(hasta);
        hastaLimit = hastaStr.includes('T') ? new Date(hastaStr) : new Date(hastaStr + 'T23:59:59.999Z');
      }

      const hasDateFilter = !!(desdeDate && hastaLimit);

      // --- 1. INGRESOS Y VENTAS POR ORIGEN DEL PROYECTO (LUXES, REDES, VENDEDORES) ---
      const projects = await prisma.proyecto.findMany({
        where: hasDateFilter ? {
          fechaCreacion: { gte: desdeDate, lte: hastaLimit }
        } : undefined,
        include: {
          fases: {
            where: { fase: 'COTIZACION' }
          }
        }
      });

      const proformas = await prisma.proforma.findMany({
        include: { abonos: true, items: true }
      });

      const sourceData: Record<string, { ventas: number; ingresos: number }> = {
        LUXES: { ventas: 0, ingresos: 0 },
        REDES: { ventas: 0, ingresos: 0 },
        VENDEDORES: { ventas: 0, ingresos: 0 }
      };

      for (const p of projects) {
        const source = (p.medio || 'LUXES').toUpperCase();
        if (!sourceData[source]) {
          sourceData[source] = { ventas: 0, ingresos: 0 };
        }

        const cotizacionFase = p.fases.find(f => f.fase === 'COTIZACION');
        let linkedProformaIds: string[] = [];
        try {
          if (cotizacionFase?.datos) {
            const parsed = JSON.parse(cotizacionFase.datos);
            const cotizaciones = parsed.cotizacionesSeleccionadas || [];
            linkedProformaIds = cotizaciones.map((c: any) => String(c.id));
          }
        } catch {}

        if (linkedProformaIds.length > 0) {
          const matchedProformas = proformas.filter(prof => linkedProformaIds.includes(prof.id));
          for (const prof of matchedProformas) {
            const subtotal = prof.items.reduce((sum, item) => sum + Number(item.cantidad) * Number(item.precioUnitario), 0);
            const totalVal = subtotal * (1 + Number(prof.iva));
            const totalAbonado = prof.abonos.reduce((sum, ab) => sum + Number(ab.monto), 0);
            sourceData[source].ventas += totalVal;
            sourceData[source].ingresos += totalAbonado;
          }
        } else {
          sourceData[source].ventas += Number(p.montoEstimado) || 0;
        }
      }

      // --- 2. TRABAJOS REALIZADOS, CALIFICACIONES Y ENTREGAS ---
      const clientProjectCounts = await prisma.proyecto.groupBy({
        by: ['clienteNombre'],
        _count: { id: true },
        where: hasDateFilter ? {
          fechaCreacion: { gte: desdeDate, lte: hastaLimit }
        } : undefined
      });

      const totalClientesConTrabajos = clientProjectCounts.length;

      const phasesWithSurvey = await prisma.proyectoFase.findMany({
        where: {
          fase: { in: ['INSTALACION', 'COMPLETADO'] },
          datos: { contains: 'encuestaSatisfaccion' }
        },
        include: {
          proyecto: {
            select: { id: true, fechaCreacion: true }
          }
        }
      });

      let SatisfechosCount = 0;
      let NeutrosCount = 0;
      let InconformesCount = 0;

      for (const f of phasesWithSurvey) {
        try {
          const json = JSON.parse(f.datos);
          const encuesta = json.encuestaSatisfaccion;
          if (encuesta && encuesta.completada) {
            const fechaSurvey = encuesta.fechaRespuesta ? new Date(encuesta.fechaRespuesta) : null;
            if (hasDateFilter && fechaSurvey) {
              if (fechaSurvey < desdeDate! || fechaSurvey > hastaLimit!) continue;
            }

            const rating = Number(encuesta.calificacionGeneral);
            if (rating >= 4) SatisfechosCount++;
            else if (rating === 3) NeutrosCount++;
            else InconformesCount++;
          }
        } catch {}
      }

      const activeProjects = await prisma.proyecto.findMany({
        where: {
          NOT: { estado: { in: ['COMPLETADO', 'CANCELADO'] } },
          ...(hasDateFilter ? { fechaCreacion: { gte: desdeDate, lte: hastaLimit } } : {})
        }
      });

      const completedProjects = await prisma.proyecto.findMany({
        where: {
          estado: 'COMPLETADO',
          ...(hasDateFilter ? { fechaCompletado: { gte: desdeDate, lte: hastaLimit } } : {})
        }
      });

      let entregasFueraDeTiempo = 0;
      for (const p of completedProjects) {
        if (p.fechaEntregaEstimada && p.fechaCompletado) {
          const entrega = new Date(p.fechaEntregaEstimada);
          const completado = new Date(p.fechaCompletado);
          if (completado > entrega) entregasFueraDeTiempo++;
        }
      }

      // --- 3. VENTAS POR MES Y SEMANA ---
      // Incluimos Aprobada + Pagada (proformas cobradas total o parcialmente)
      const activeProformas = await prisma.proforma.findMany({
        where: {
          estado: { in: ['Aprobada', 'Pagada', 'Pagado'] },
          ...(hasDateFilter ? { fecha: { gte: desdeDate, lte: hastaLimit } } : {})
        },
        include: { items: true }
      });

      const ventasPorMes: Record<string, number> = {};
      const ventasPorSemana: Record<string, number> = {
        'Semana 1': 0,
        'Semana 2': 0,
        'Semana 3': 0,
        'Semana 4': 0,
        'Semana 5': 0
      };

      for (const prof of activeProformas) {
        const f = new Date(prof.fecha);
        const MES_V = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
        const monthLabel = MES_V[f.getUTCMonth()];
        const profSubtotal = prof.items.reduce((sum, item) => sum + Number(item.cantidad) * Number(item.precioUnitario), 0);
        const profTotal = profSubtotal * (1 + Number(prof.iva));
        ventasPorMes[monthLabel] = (ventasPorMes[monthLabel] || 0) + profTotal;

        const day = f.getUTCDate();
        if (day <= 7) ventasPorSemana['Semana 1'] += profTotal;
        else if (day <= 14) ventasPorSemana['Semana 2'] += profTotal;
        else if (day <= 21) ventasPorSemana['Semana 3'] += profTotal;
        else if (day <= 28) ventasPorSemana['Semana 4'] += profTotal;
        else ventasPorSemana['Semana 5'] += profTotal;
      }

      // --- 4. INGRESOS POR METODO DE PAGO ---
      const allIngresos = await prisma.ingreso.findMany({
        where: hasDateFilter ? { fecha: { gte: desdeDate, lte: hastaLimit } } : undefined,
        include: { metodoPago: true }
      });

      const abonosProforma = await prisma.abonoProforma.findMany({
        where: hasDateFilter ? { fecha: { gte: desdeDate, lte: hastaLimit } } : undefined,
        include: { metodoPago: true }
      });

      const ingresosPorMetodo: Record<string, number> = {};

      for (const ing of allIngresos) {
        const mName = ing.metodoPago?.nombre || 'Otros';
        ingresosPorMetodo[mName] = (ingresosPorMetodo[mName] || 0) + Number(ing.monto);
      }
      for (const ab of abonosProforma) {
        const mName = ab.metodoPago?.nombre || 'Otros';
        ingresosPorMetodo[mName] = (ingresosPorMetodo[mName] || 0) + Number(ab.monto);
      }

      // --- 5. CUENTAS POR COBRAR POR MES ---
      const unpaidProformas = await prisma.proforma.findMany({
        where: {
          estado: 'Aprobada'
        },
        include: { abonos: true, items: true }
      });

      const ctasPorCobrarPorMes: Record<string, number> = {};
      const ctasPorCobrarDetalle: any[] = [];

      for (const prof of unpaidProformas) {
        const f = new Date(prof.fecha);
        if (hasDateFilter) {
          if (f < desdeDate! || f > hastaLimit!) continue;
        }

        const profSubtotal = prof.items.reduce((sum, item) => sum + Number(item.cantidad) * Number(item.precioUnitario), 0);
        const profTotal = profSubtotal * (1 + Number(prof.iva));
        const totalAbonado = prof.abonos.reduce((sum, ab) => sum + Number(ab.monto), 0);
        const pendiente = profTotal - totalAbonado;

        if (pendiente > 0) {
          const MES_CC = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
          const monthLabel = MES_CC[f.getUTCMonth()];
          ctasPorCobrarPorMes[monthLabel] = (ctasPorCobrarPorMes[monthLabel] || 0) + pendiente;
          ctasPorCobrarDetalle.push({
            id: prof.id,
            clienteNombre: prof.clienteNombre,
            total: profTotal,
            cobrado: totalAbonado,
            pendiente: Math.max(0, pendiente),
            fecha: f.toISOString().split('T')[0]
          });
        }
      }

      // --- 6. GASTOS (DEVENGADOS) Y EGRESOS (PAGOS REALES) POR CATEGORÍA, MES Y SEMANA ---
      const allGastosGeneral = await prisma.gasto.findMany({
        where: hasDateFilter ? { fecha: { gte: desdeDate, lte: hastaLimit } } : undefined
      });

      const ocs = await prisma.ordenCompra.findMany({
        where: hasDateFilter ? { fecha: { gte: desdeDate, lte: hastaLimit } } : undefined,
        include: { abonos: true }
      });

      const nominas = await prisma.nominaRegistro.findMany({
        where: hasDateFilter ? {
          fechaFin: { gte: desdeDate, lte: hastaLimit }
        } : undefined,
        include: { empleado: true }
      });

      const gastosPorTipo: Record<string, number> = {
        'Nómina': 0,          // Costo laboral total (neto empleado + IESS patronal)
        'Compras (OC)': 0,
        'Vehículos': 0,
        'Redes y Programas': 0,
        'Servicios Básicos': 0,
        'Oficina': 0,
        'Logística': 0,
        'Varios': 0
      };

      const gastosPorMes: Record<string, number> = {};
      const gastosPorSemana: Record<string, number> = {
        'Semana 1': 0,
        'Semana 2': 0,
        'Semana 3': 0,
        'Semana 4': 0,
        'Semana 5': 0
      };

      const nominaPorRol: Record<string, number> = {};
      let totalIess = 0;

      for (const n of nominas) {
        if (Number(n.diasLaborados) <= 0) continue;

        let ingVal = 0;
        let egrVal = 0;
        let iessVal = 0;
        try {
          const ingObj: any = n.ingresos ? (typeof n.ingresos === 'string' ? JSON.parse(n.ingresos) : n.ingresos) : {};
          const egrObj: any = n.egresos ? (typeof n.egresos === 'string' ? JSON.parse(n.egresos) : n.egresos) : {};
          
          // Salario base = sueldoDiario del empleado × días laborados (no está en el JSON ingresos)
          const salarioBase = Number(n.empleado?.sueldoDiario || 0) * Number(n.diasLaborados);
          const ingExtras = Object.values(ingObj).reduce((sum: number, v: any) => sum + (typeof v === 'number' ? v : (typeof v === 'string' ? Number(v) || 0 : 0)), 0) as number;
          ingVal = salarioBase + ingExtras;
          
          egrVal = Object.values(egrObj).reduce((sum: number, v: any) => sum + (typeof v === 'number' ? v : (typeof v === 'string' ? Number(v) || 0 : 0)), 0) as number;
          iessVal = Number(egrObj.iess) || 0;
        } catch {}

        // costoLaboral = neto pagado al empleado (min 0) + IESS patronal retenido
        const neto = ingVal - egrVal;
        const netoPositivo = Math.max(0, neto);
        const costoLaboral = netoPositivo + iessVal;
        gastosPorTipo['Nómina'] += costoLaboral;
        // IESS no se agrega como categoría separada (ya está incluido en costoLaboral → Nómina)
        totalIess += iessVal;

        const role = (n.empleado as any)?.nombre || 'Sin nombre';
        nominaPorRol[role] = (nominaPorRol[role] || 0) + costoLaboral;

        // Use fechaFin (period end = pay date) so the expense lands in the week it was actually paid
        const f = new Date(n.fechaFin);
        // Use UTC month to avoid timezone shift with @db.Date fields stored as midnight UTC
        const MONTHS_UTC = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
        const monthLabel = MONTHS_UTC[f.getUTCMonth()];
        gastosPorMes[monthLabel] = (gastosPorMes[monthLabel] || 0) + costoLaboral;

        const day = f.getUTCDate();
        if (day <= 7) gastosPorSemana['Semana 1'] += costoLaboral;
        else if (day <= 14) gastosPorSemana['Semana 2'] += costoLaboral;
        else if (day <= 21) gastosPorSemana['Semana 3'] += costoLaboral;
        else if (day <= 28) gastosPorSemana['Semana 4'] += costoLaboral;
        else gastosPorSemana['Semana 5'] += costoLaboral;
      }


      for (const oc of ocs) {
        gastosPorTipo['Compras (OC)'] += Number(oc.total);

        const f = new Date(oc.fecha);
        const MONTHS_UTC = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
        const monthLabel = MONTHS_UTC[f.getUTCMonth()];
        gastosPorMes[monthLabel] = (gastosPorMes[monthLabel] || 0) + Number(oc.total);

        const day = f.getUTCDate();
        if (day <= 7) gastosPorSemana['Semana 1'] += Number(oc.total);
        else if (day <= 14) gastosPorSemana['Semana 2'] += Number(oc.total);
        else if (day <= 21) gastosPorSemana['Semana 3'] += Number(oc.total);
        else if (day <= 28) gastosPorSemana['Semana 4'] += Number(oc.total);
        else gastosPorSemana['Semana 5'] += Number(oc.total);
      }

      for (const g of allGastosGeneral) {
        const cat = (g.categoria || '').toLowerCase();
        let targetCat = 'Varios';
        if (cat === 'vehiculos') targetCat = 'Vehículos';
        else if (cat === 'redes_y_programas') targetCat = 'Redes y Programas';
        else if (cat === 'servicios') targetCat = 'Servicios Básicos';
        else if (cat === 'oficina') targetCat = 'Oficina';
        else if (cat === 'logistica') targetCat = 'Logística';

        gastosPorTipo[targetCat] = (gastosPorTipo[targetCat] || 0) + Number(g.monto);

        const f = new Date(g.fecha);
        const MONTHS_UTC = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
        const monthLabel = MONTHS_UTC[f.getUTCMonth()];
        gastosPorMes[monthLabel] = (gastosPorMes[monthLabel] || 0) + Number(g.monto);

        const day = f.getUTCDate();
        if (day <= 7) gastosPorSemana['Semana 1'] += Number(g.monto);
        else if (day <= 14) gastosPorSemana['Semana 2'] += Number(g.monto);
        else if (day <= 21) gastosPorSemana['Semana 3'] += Number(g.monto);
        else if (day <= 28) gastosPorSemana['Semana 4'] += Number(g.monto);
        else gastosPorSemana['Semana 5'] += Number(g.monto);
      }

      const abonosCompra = await prisma.abonoCompra.findMany({
        where: hasDateFilter ? { fecha: { gte: desdeDate, lte: hastaLimit } } : undefined
      });

      const egresosAnticipos = await prisma.egreso.findMany({
        where: hasDateFilter ? { fecha: { gte: desdeDate, lte: hastaLimit } } : undefined
      });

      const egresosPorTipo: Record<string, number> = {
        'Nómina y Anticipos': egresosAnticipos.reduce((sum, e) => sum + Number(e.monto), 0),
        'Compras (OC)': abonosCompra.reduce((sum, a) => sum + Number(a.monto), 0),
        'Vehículos': allGastosGeneral.filter(g => g.categoria === 'vehiculos').reduce((sum, g) => sum + Number(g.monto), 0),
        'Redes y Programas': allGastosGeneral.filter(g => g.categoria === 'redes_y_programas').reduce((sum, g) => sum + Number(g.monto), 0),
        'Otros Egresos': allGastosGeneral.filter(g => !['vehiculos', 'redes_y_programas'].includes(g.categoria || '')).reduce((sum, g) => sum + Number(g.monto), 0)
      };

      let sumAbonosNomina = 0;
      for (const n of nominas) {
        try {
          const abArr = n.abonos ? (typeof n.abonos === 'string' ? JSON.parse(n.abonos) : n.abonos) : [];
          if (Array.isArray(abArr)) {
            for (const ab of abArr) {
              const abFecha = ab.fecha ? new Date(ab.fecha) : null;
              if (hasDateFilter && abFecha) {
                if (abFecha < desdeDate! || abFecha > hastaLimit!) continue;
              }
              sumAbonosNomina += Number(ab.monto) || 0;
            }
          }
        } catch {}
      }
      egresosPorTipo['Nómina y Anticipos'] += sumAbonosNomina;

      // --- 7. COMPARATIVOS MENSUALES (HISTÓRICO) ---
      const ingresosPorMes: Record<string, number> = {};
      const egresosPorMes: Record<string, number> = {};

      const MES_UTC = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];

      for (const ing of allIngresos) {
        const month = MES_UTC[new Date(ing.fecha).getUTCMonth()];
        ingresosPorMes[month] = (ingresosPorMes[month] || 0) + Number(ing.monto);
      }
      for (const ab of abonosProforma) {
        const month = MES_UTC[new Date(ab.fecha).getUTCMonth()];
        ingresosPorMes[month] = (ingresosPorMes[month] || 0) + Number(ab.monto);
      }

      for (const ab of abonosCompra) {
        const month = MES_UTC[new Date(ab.fecha).getUTCMonth()];
        egresosPorMes[month] = (egresosPorMes[month] || 0) + Number(ab.monto);
      }
      for (const e of egresosAnticipos) {
        const month = MES_UTC[new Date(e.fecha).getUTCMonth()];
        egresosPorMes[month] = (egresosPorMes[month] || 0) + Number(e.monto);
      }
      for (const g of allGastosGeneral) {
        const month = MES_UTC[new Date(g.fecha).getUTCMonth()];
        egresosPorMes[month] = (egresosPorMes[month] || 0) + Number(g.monto);
      }
      for (const n of nominas) {
        if (Number(n.diasLaborados) <= 0) continue;
        try {
          const abArr = n.abonos ? (typeof n.abonos === 'string' ? JSON.parse(n.abonos) : n.abonos) : [];
          if (Array.isArray(abArr)) {
            for (const ab of abArr) {
              const month = MES_UTC[new Date(ab.fecha || n.fechaInicio).getUTCMonth()];
              egresosPorMes[month] = (egresosPorMes[month] || 0) + (Number(ab.monto) || 0);
            }
          }
        } catch {}
      }

      // --- 8. CUENTAS POR PAGAR (COMPRAS) POR MES ---
      const ctasPorPagarPorMes: Record<string, { total: number; pagado: number; pendiente: number }> = {};
      for (const oc of ocs) {
        const month = MES_UTC[new Date(oc.fecha).getUTCMonth()];
        if (!ctasPorPagarPorMes[month]) {
          ctasPorPagarPorMes[month] = { total: 0, pagado: 0, pendiente: 0 };
        }

        const pagadoVal = oc.abonos.reduce((sum, ab) => sum + Number(ab.monto), 0);
        ctasPorPagarPorMes[month].total += Number(oc.total);
        ctasPorPagarPorMes[month].pagado += pagadoVal;
        ctasPorPagarPorMes[month].pendiente += Math.max(0, Number(oc.total) - pagadoVal);
      }

      const monthsList = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
      const defaultMonthlyObject = (val = 0) => monthsList.reduce((acc, m) => ({ ...acc, [m]: val }), {});

      return res.status(200).json({
        success: true,
        data: {
          sourceAttr: sourceData,
          surveyStats: {
            totalClientes: totalClientesConTrabajos,
            satisfechos: SatisfechosCount,
            neutros: NeutrosCount,
            inconformes: InconformesCount,
            pendientesEntrega: activeProjects.length,
            tarde: entregasFueraDeTiempo
          },
          ventas: {
            porSemana: ventasPorSemana,
            porMes: { ...defaultMonthlyObject(0), ...ventasPorMes }
          },
          ingresosMetodo: ingresosPorMetodo,
          cuentasPorCobrar: { ...defaultMonthlyObject(0), ...ctasPorCobrarPorMes },
          cuentasPorCobrarDetalle: ctasPorCobrarDetalle,
          gastosDevengados: {
            porTipo: gastosPorTipo,
            porSemana: gastosPorSemana,
            porMes: { ...defaultMonthlyObject(0), ...gastosPorMes }
          },
          egresos: {
            porTipo: egresosPorTipo,
            porMes: { ...defaultMonthlyObject(0), ...egresosPorMes }
          },
          comparativos: {
            ingresosEgresos: {
              ingresos: { ...defaultMonthlyObject(0), ...ingresosPorMes },
              egresos: { ...defaultMonthlyObject(0), ...egresosPorMes }
            },
            ventasGastos: {
              ventas: { ...defaultMonthlyObject(0), ...ventasPorMes },
              gastos: { ...defaultMonthlyObject(0), ...gastosPorMes }
            }
          },
          nomina: {
            porRol: nominaPorRol,
            iessTotal: totalIess
          },
          cuentasPorPagar: monthsList.reduce((acc: any, m) => {
            acc[m] = ctasPorPagarPorMes[m] || { total: 0, pagado: 0, pendiente: 0 };
            return acc;
          }, {})
        }
      });
    } catch (error) {
      console.error('[finanzas/reportes/balances]', error);
      return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al generar reporte de balances' } });
    }
  }
}
