import type { Prisma } from '@prisma/client';
import { getEcuadorDateString } from '../../../shared/utils/dateOnly.js';
import { type BalancePeriod, paymentInPeriod, paymentMonth, saleBalance, summarizeSurveys, roundMoney } from './balanceRules.js';
const MONTHS = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];

// Read-only report: no scheduler, reconciliation, or mutations.
export async function getBalancesReportData(db: Prisma.TransactionClient, period: BalancePeriod) {
      // --- 1. INGRESOS Y VENTAS POR MEDIO DE CONSECUCIÓN (LUXES, REDES, VENDEDORES) ---
      const proformas = await db.proforma.findMany({
        where: { fecha: period.calendar },
        include: { abonos: true, items: true }
      });

      const sourceData: Record<string, { ventas: number; ingresos: number }> = {
        LUXES: { ventas: 0, ingresos: 0 },
        REDES: { ventas: 0, ingresos: 0 },
        VENDEDORES: { ventas: 0, ingresos: 0 }
      };

      const balances = proformas.map(prof => ({ prof, ...saleBalance(prof, period) })).filter(b => b.included);
      for (const { prof, total } of balances) {
        const source = (prof.medio || 'LUXES').toUpperCase();
        sourceData[source] ||= { ventas: 0, ingresos: 0 };
        sourceData[source].ventas += total;
        sourceData[source].ingresos += prof.abonos.filter(a => paymentInPeriod(a.fecha, period)).reduce((s,a)=>s+Number(a.monto),0);
      }

      // --- 2. TRABAJOS REALIZADOS, CALIFICACIONES Y ENTREGAS ---
      const clientProjectCounts = await db.proyecto.groupBy({
        by: ['clienteNombre'],
        _count: { id: true },
        where: { fechaCreacion: period.timestamps }
      });

      const totalClientesConTrabajos = clientProjectCounts.length;

      const phasesWithSurvey = await db.proyectoFase.findMany({
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

      const surveyCounts = summarizeSurveys(phasesWithSurvey, period);

      const activeProjects = await db.proyecto.findMany({
        where: {
          NOT: { estado: { in: ['COMPLETADO', 'CANCELADO'] } },
          fechaCreacion: period.timestamps
        }
      });

      const completedProjects = await db.proyecto.findMany({
        where: {
          estado: 'COMPLETADO',
          fechaCompletado: period.timestamps
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
      const ventasPorMes: Record<string, number> = {};
      const ventasPorSemana: Record<string, number> = {
        'Semana 1': 0,
        'Semana 2': 0,
        'Semana 3': 0,
        'Semana 4': 0,
        'Semana 5': 0
      };

      for (const { prof, total: profTotal } of balances) {
        const f = new Date(prof.fecha);
        const monthLabel = MONTHS[f.getUTCMonth()]!;
        ventasPorMes[monthLabel] = (ventasPorMes[monthLabel] || 0) + profTotal;

        const day = f.getUTCDate();
        if (day <= 7) ventasPorSemana['Semana 1'] += profTotal;
        else if (day <= 14) ventasPorSemana['Semana 2'] += profTotal;
        else if (day <= 21) ventasPorSemana['Semana 3'] += profTotal;
        else if (day <= 28) ventasPorSemana['Semana 4'] += profTotal;
        else ventasPorSemana['Semana 5'] += profTotal;
      }

      // --- 4. INGRESOS POR METODO DE PAGO ---
      const allIngresos = await db.ingreso.findMany({
        where: { fecha: period.calendar },
        include: { metodoPago: true }
      });

      const abonosProforma = (await db.abonoProforma.findMany({
        where: { fecha: period.payments },
        include: { metodoPago: true, proforma: { select: { fecha: true } } }
      })).filter(a => paymentInPeriod(a.fecha, period));

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
      const ctasPorCobrarPorMes: Record<string, number> = {};
      const ctasPorCobrarDetalle: any[] = [];
      for (const { prof, total, paid, pendiente } of balances) {
        if (pendiente <= 0) continue;
        const date = new Date(prof.fecha).toISOString().slice(0,10);
        const month = MONTHS[new Date(prof.fecha).getUTCMonth()]!;
        ctasPorCobrarPorMes[month] = (ctasPorCobrarPorMes[month] || 0) + pendiente;
        ctasPorCobrarDetalle.push({ id:prof.id, clienteNombre:prof.clienteNombre, total, cobrado:paid, pendiente, fecha:date });
      }

      // --- 6. GASTOS (DEVENGADOS) Y EGRESOS (PAGOS REALES) POR CATEGORÍA, MES Y SEMANA ---
      const allGastosGeneral = await db.gasto.findMany({
        where: { fecha: period.calendar }
      });

      const ocs = await db.ordenCompra.findMany({
        where: { fecha: period.calendar },
        include: { abonos: true, cuentaPorPagar: true }
      });

      const nominas = await db.nominaRegistro.findMany({
        where: { fechaFin: period.calendar },
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
        if (['anulada','cancelada','rechazada'].includes(oc.estado)) continue;
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

      const abonosCompra = (await db.abonoCompra.findMany({
        where: { fecha: period.payments }
      })).filter(a => paymentInPeriod(a.fecha, period));

      const egresosAnticipos = await db.egreso.findMany({
        where: { tipo: 'ANTICIPO', fecha: period.calendar }
      });

      const egresosPorTipo: Record<string, number> = {
        'Nómina y Anticipos': egresosAnticipos.reduce((sum, e) => sum + Number(e.monto), 0),
        'Compras (OC)': abonosCompra.reduce((sum, a) => sum + Number(a.monto), 0),
        'Vehículos': allGastosGeneral.filter(g => g.categoria === 'vehiculos').reduce((sum, g) => sum + Number(g.monto), 0),
        'Redes y Programas': allGastosGeneral.filter(g => g.categoria === 'redes_y_programas').reduce((sum, g) => sum + Number(g.monto), 0),
        'Otros Egresos': allGastosGeneral.filter(g => !['vehiculos', 'redes_y_programas'].includes(g.categoria || '')).reduce((sum, g) => sum + Number(g.monto), 0)
      };

      const payrollRows = await db.nominaRegistro.findMany({ select: { abonos: true } });
      const payrollPayments: { fecha: string; monto: number }[] = [];
      for (const n of payrollRows) {
        try {
          const rows = typeof n.abonos === 'string' ? JSON.parse(n.abonos) : n.abonos;
          if (!Array.isArray(rows)) continue;
          for (const ab of rows) {
            if (ab.fecha && Number.isFinite(Number(ab.monto)) && paymentInPeriod(ab.fecha, period)) payrollPayments.push({fecha:ab.fecha,monto:Number(ab.monto)});
          }
        } catch { /* Invalid payment records are not assigned to an invented date. */ }
      }
      egresosPorTipo['Nómina y Anticipos'] += payrollPayments.reduce((s,p)=>s+p.monto,0);

      // --- 7. COMPARATIVOS MENSUALES (HISTÓRICO) ---
      const ingresosPorMes: Record<string, number> = {};
      const egresosPorMes: Record<string, number> = {};

      const MES_UTC = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];

      for (const ing of allIngresos) {
        const month = MES_UTC[new Date(ing.fecha).getUTCMonth()];
        ingresosPorMes[month] = (ingresosPorMes[month] || 0) + Number(ing.monto);
      }
      for (const ab of abonosProforma) {
        const month = MES_UTC[paymentMonth(ab.fecha)];
        ingresosPorMes[month] = (ingresosPorMes[month] || 0) + Number(ab.monto);
      }

      for (const ab of abonosCompra) {
        const month = MES_UTC[paymentMonth(ab.fecha)];
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
      for (const ab of payrollPayments) {
        const month = MONTHS[paymentMonth(ab.fecha)]!;
        egresosPorMes[month] = (egresosPorMes[month] || 0) + ab.monto;
      }

      // --- 8. CUENTAS POR PAGAR (COMPRAS) POR MES ---
      const ctasPorPagarPorMes: Record<string, { total: number; pagado: number; pendiente: number }> = {};
      for (const oc of ocs) {
        const month = MES_UTC[new Date(oc.fecha).getUTCMonth()];
        if (!ctasPorPagarPorMes[month]) {
          ctasPorPagarPorMes[month] = { total: 0, pagado: 0, pendiente: 0 };
        }

        const pagadoVal = oc.abonos.filter(ab => getEcuadorDateString(ab.fecha) <= period.hasta).reduce((sum, ab) => sum + Number(ab.monto), 0);
        const canceled = ['anulada','cancelada','rechazada'].includes(oc.estado);
        const pending = canceled ? (oc.cuentaPorPagar?.saldo || 0) : Math.max(0, Number(oc.total)-pagadoVal);
        ctasPorPagarPorMes[month].total += canceled ? pagadoVal + pending : Number(oc.total);
        ctasPorPagarPorMes[month].pagado += pagadoVal;
        ctasPorPagarPorMes[month].pendiente += pending;
      }

      const monthsList = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
      const defaultMonthlyObject = (val = 0) => monthsList.reduce<Record<string, number>>((acc, m) => ({ ...acc, [m]: val }), {});


      return {
          periodo: { desde: period.desde, hasta: period.hasta },
          ingresosDetalle: {
            cobrosVentas: roundMoney(abonosProforma.reduce((s,a)=>s+Number(a.monto),0)),
            otrosIngresos: roundMoney(allIngresos.reduce((s,a)=>s+Number(a.monto),0)),
          },
          carteraPeriodo: {
            ventas: roundMoney(balances.reduce((s,b)=>s+b.total,0)),
            cobrado: roundMoney(balances.reduce((s,b)=>s+Math.min(b.paid,b.total),0)),
            pendiente: roundMoney(balances.reduce((s,b)=>s+b.pendiente,0)),
          },
          sourceAttr: sourceData,
          surveyStats: {
            totalClientes: totalClientesConTrabajos,
            ...surveyCounts,
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
      };
}
