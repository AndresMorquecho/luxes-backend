// Executes the report against the configured DB under an enforced read-only transaction.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { balancePeriod, roundMoney } from '../features/gastos/application/balanceRules.js';
import { getBalancesReportData } from '../features/gastos/application/balancesReport.js';
const db = new PrismaClient({ log: [] });
const sum = (v: Record<string, number>) => roundMoney(Object.values(v).reduce((s,n)=>s+n,0));
try {
  const results = await db.$transaction(async tx => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    await tx.$executeRaw`SET LOCAL statement_timeout = '15000ms'`;
    await tx.$executeRaw`SET LOCAL lock_timeout = '2000ms'`;
    const mode = await tx.$queryRaw<{transaction_read_only:string}[]>`SHOW transaction_read_only`;
    assert.equal(mode[0]?.transaction_read_only, 'on');
    const sept = await getBalancesReportData(tx,balancePeriod('2026-09-01','2026-09-30'));
    const annual = await getBalancesReportData(tx,balancePeriod('2026-01-01','2026-12-31'));
    const prior = await getBalancesReportData(tx,balancePeriod('2025-01-01','2025-12-31'));
    const yearToDate = await getBalancesReportData(tx,balancePeriod('2026-01-01','2026-09-30'));
    for (const report of [sept,annual,prior,yearToDate]) {
      assert.equal(sum(report.ventas.porMes), roundMoney(Object.values(report.sourceAttr).reduce((s,c)=>s+c.ventas,0)));
      assert.equal(sum(report.ventas.porMes),sum(report.ventas.porSemana));
      assert.equal(sum(report.ingresosMetodo),sum(report.comparativos.ingresosEgresos.ingresos));
      assert.equal(sum(report.egresos.porTipo),sum(report.egresos.porMes));
      assert.equal(sum(report.cuentasPorCobrar),report.carteraPeriodo.pendiente);
      assert.equal(roundMoney(report.carteraPeriodo.cobrado+report.carteraPeriodo.pendiente),report.carteraPeriodo.ventas);
    }
    assert.equal(roundMoney(annual.ventas.porMes.SEP || 0),sum(sept.ventas.porMes));
    assert.equal(roundMoney(annual.comparativos.ingresosEgresos.ingresos.SEP || 0),sum(sept.ingresosMetodo));
    assert.equal(roundMoney(yearToDate.cuentasPorCobrar.SEP || 0),sept.carteraPeriodo.pendiente);
    return {sept,annual,prior,yearToDate};
  },{timeout:60000,isolationLevel:'RepeatableRead'});
  writeFileSync('../backup_temp/balances-verificados-2026-09.json',JSON.stringify(results,null,2));
  console.log(JSON.stringify({readOnly:true,checks:'passed',ventas:results.sept.carteraPeriodo,ingresos:results.sept.ingresosMetodo,desgloseIngresos:results.sept.ingresosDetalle,encuestas:results.sept.surveyStats,ventas2025:sum(results.prior.ventas.porMes)},null,2));
} catch(error: any) { console.error(JSON.stringify({code:error.code||'VERIFY_FAILED',message:String(error.message).replace(/postgres(?:ql)?:\/\/\S+/g,'[redacted]')}));process.exitCode=1; }
finally {await db.$disconnect();}
