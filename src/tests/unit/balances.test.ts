import { test } from 'node:test';
import assert from 'node:assert/strict';
import { balancePeriod, paymentInPeriod, paymentMonth, saleBalance, summarizeSurveys } from '../../features/gastos/application/balanceRules.js';
import { getBalancesReportData } from '../../features/gastos/application/balancesReport.js';
const september = balancePeriod('2026-09-01','2026-09-30');
test('calendar dates include September 1 and exclude October 1 without an Ecuador shift',()=>{
  assert.equal(september.calendar.gte.toISOString(),'2026-09-01T00:00:00.000Z');
  assert.equal(september.calendar.lt.toISOString(),'2026-10-01T00:00:00.000Z');
  assert.throws(()=>balancePeriod('2026-02-30','2026-03-01'));
  assert.throws(()=>balancePeriod('2026-09-30','2026-09-01'));
  assert.throws(()=>balancePeriod(undefined,'2026-09-30'));
  assert.equal(balancePeriod('2024-02-01','2024-02-29').calendar.lt.toISOString(),'2024-03-01T00:00:00.000Z');
});
test('payments use Ecuador transaction dates and retain legacy calendar dates',()=>{
  assert.equal(paymentInPeriod('2026-09-01T00:00:00Z',september),true);
  assert.equal(paymentInPeriod('2026-09-01T04:59:59Z',september),false);
  assert.equal(paymentInPeriod('2026-09-01T05:00:00Z',september),true);
  assert.equal(paymentInPeriod('2026-10-01T04:59:59Z',september),true);
  assert.equal(paymentMonth('2026-10-01T04:59:59Z'),8);
  assert.equal(paymentInPeriod('2026-10-01T05:00:00Z',september),false);
  assert.equal(paymentInPeriod('2026-10-01T00:00:00Z',september),false);
});
test('approved sales without payment count; later payments do not clear the September balance',()=>{
  const sale={estado:'Aprobada',iva:0.15,items:[{cantidad:1,precioUnitario:100}],abonos:[] as {fecha:string;monto:number}[]};
  assert.deepEqual(saleBalance(sale,september),{included:true,total:115,paid:0,pendiente:115});
  sale.abonos=[{fecha:'2026-09-30T12:00:00Z',monto:40},{fecha:'2026-10-01T12:00:00Z',monto:75}];
  assert.deepEqual(saleBalance(sale,september),{included:true,total:115,paid:40,pendiente:75});
  assert.equal(saleBalance({...sale,estado:'Rechazada'},september).included,false);
  assert.equal(saleBalance({...sale,estado:'Pendiente',abonos:[]},september).included,false);
});
const phase=(id:string,survey:object)=>({proyectoId:id,datos:JSON.stringify({encuestaSatisfaccion:survey})});
test('empty, malformed, undated and out-of-period surveys never become dissatisfied responses',()=>{
  const rows=[phase('empty',{}),phase('zero',{completada:true,calificacionGeneral:0,fecha:'2026-09-01'}),phase('missing',{completada:true,calificacionGeneral:5}),phase('old',{completada:true,calificacionGeneral:2,fechaRespuesta:'2026-08-28T12:00:00Z'}),{proyectoId:'bad',datos:'invalid'}];
  assert.deepEqual(summarizeSurveys(rows,september),{totalEncuestas:0,satisfechos:0,neutros:0,inconformes:0});
});
test('actual survey categories sum to completed responses and each project counts once',()=>{
  const good=phase('a',{completada:true,calificacionGeneral:5,fechaRespuesta:'2026-09-01T05:00:00Z'});
  const rows=[good,good,phase('b',{completada:true,calificacionGeneral:3,fecha:'2026-09-15'}),phase('c',{completada:true,calificacionGeneral:2,fechaRespuesta:'2026-10-01T04:59:59Z'})];
  assert.deepEqual(summarizeSurveys(rows,september),{totalEncuestas:3,satisfechos:1,neutros:1,inconformes:1});
});
test('payroll cash flow follows payment date and only advances count as cash expenses',async()=>{
  const empty={findMany:async()=>[]};
  const db:any={proforma:empty,proyecto:{...empty,groupBy:async()=>[]},proyectoFase:empty,ingreso:empty,abonoProforma:empty,gasto:empty,ordenCompra:empty,abonoCompra:empty,
    nominaRegistro:{findMany:async(args:any)=>args.select ? [{abonos:JSON.stringify([{fecha:'2026-09-15',monto:20},{fecha:'2026-10-15',monto:90}])}] : []},
    egreso:{findMany:async(args:any)=>{assert.equal(args.where.tipo,'ANTICIPO');return [{fecha:new Date('2026-09-02T00:00:00Z'),monto:5}];}},
  };
  const report=await getBalancesReportData(db,september);
  assert.equal(report.egresos.porTipo['Nómina y Anticipos'],25);
  assert.equal(report.egresos.porMes.SEP,25);
  assert.equal((report.egresos.porMes as Record<string,number>).OCT,0);
});
