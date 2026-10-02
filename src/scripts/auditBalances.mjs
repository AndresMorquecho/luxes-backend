// Read-only production audit. Supply DATABASE_URL through the environment; never starts the app.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { writeFileSync } from 'node:fs';
const db = new PrismaClient({ log: [] });
const month = process.argv[2] || '2026-09';
if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Use YYYY-MM');
const from = `${month}-01`, end = new Date(Date.UTC(Number(month.slice(0,4)), Number(month.slice(5)), 0)).toISOString().slice(0,10);
const utcDay = d => new Date(d).toISOString().slice(0,10);
const transactionDay = d => { const v = new Date(d); return v.toISOString().endsWith('T00:00:00.000Z') ? utcDay(v) : utcDay(v.getTime()-5*3600000); };
const inMonth = d => d >= from && d <= end;
const round = n => Math.round(n*100)/100;
const group = (rows, key, amount) => rows.reduce((o,r)=> { const k=key(r); o[k]=round((o[k]||0)+amount(r)); return o; },{});
try {
  const report = await db.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '15000ms'");
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '2000ms'");
    const mode = await tx.$queryRawUnsafe('SHOW transaction_read_only');
    if (mode[0]?.transaction_read_only !== 'on') throw new Error('Read-only guard failed');
    const proformas = await tx.proforma.findMany({where:{fecha:{gte:new Date(`${month.slice(0,4)}-01-01Z`),lt:new Date(`${Number(month.slice(0,4))+1}-01-01Z`)}},select:{id:true,fecha:true,fechaAprobacion:true,estado:true,medio:true,iva:true,items:{select:{cantidad:true,precioUnitario:true}},abonos:{select:{fecha:true,monto:true}}},orderBy:{fecha:'asc'}});
    const income = await tx.ingreso.findMany({where:{fecha:{gte:new Date(`${from}Z`),lte:new Date(`${end}Z`)}},select:{id:true,fecha:true,monto:true,categoria:true,concepto:true,metodoPago:{select:{nombre:true}}}});
    const payments = await tx.abonoProforma.findMany({where:{fecha:{gte:new Date(`${from}T00:00:00Z`),lte:new Date(`${end}T23:59:59.999-05:00`)}},include:{metodoPago:{select:{nombre:true}},proforma:{select:{id:true,fecha:true,estado:true}}}});
    const surveys = await tx.proyectoFase.findMany({where:{fase:{in:['INSTALACION','COMPLETADO']},datos:{contains:'encuestaSatisfaccion'}},select:{proyectoId:true,fase:true,datos:true}});
    const rows = proformas.map(p => {
      const subtotal = round(p.items.reduce((s,i)=>s+Number(i.cantidad)*Number(i.precioUnitario),0));
      return {id:p.id,fecha:utcDay(p.fecha),aprobacion:p.fechaAprobacion?.toISOString(),estado:p.estado,medio:p.medio,subtotal,iva:Number(p.iva),total:round(subtotal*(1+Number(p.iva))),pagado:round(p.abonos.reduce((s,a)=>s+a.monto,0)),pagadoAlCierre:round(p.abonos.filter(a=>transactionDay(a.fecha)<=end).reduce((s,a)=>s+a.monto,0)),pagosDelMes:round(p.abonos.filter(a=>inMonth(transactionDay(a.fecha))).reduce((s,a)=>s+a.monto,0))};
    });
    const period=rows.filter(r=>inMonth(r.fecha));
    const sales=period.filter(r=>['Aprobada','Pagada','Pagado'].includes(r.estado)||r.pagado>0);
    const oldSales=rows.filter(r=>new Date(`${r.fecha}Z`)>=new Date(`${from}T00:00:00-05:00`)&&new Date(`${r.fecha}Z`)<=new Date(`${end}T23:59:59.999-05:00`)&&(['Aprobada','Pagada'].includes(r.estado)||r.pagado>0));
    const cashPayments=payments.filter(p=>inMonth(transactionDay(p.fecha)));
    const surveyRows=surveys.map(f=>{try {const s=JSON.parse(f.datos).encuestaSatisfaccion;return {proyectoId:f.proyectoId,fase:f.fase,completada:s?.completada,fechaRespuesta:s?.fechaRespuesta,fecha:s?.fecha,rating:s?.calificacionGeneral};} catch{return {invalid:true};}});
    return {month,readOnly:true,totals:{oldSales:round(oldSales.reduce((s,r)=>s+r.total,0)),calendarSales:round(sales.reduce((s,r)=>s+r.total,0)),calendarSalesWithoutTax:round(sales.reduce((s,r)=>s+r.subtotal,0)),saleCount:sales.length,receivableAtClose:round(sales.reduce((s,r)=>s+Math.max(0,r.total-r.pagadoAlCierre),0)),salesByStatus:group(period,r=>r.estado,r=>r.total),salesBySource:group(sales,r=>r.medio,r=>r.total),paymentsByAccount:group(cashPayments,p=>p.metodoPago.nombre,p=>p.monto),paymentsBySaleMonth:group(cashPayments,p=>utcDay(p.proforma.fecha).slice(0,7),p=>p.monto),manualIncomeByAccount:group(income,r=>r.metodoPago?.nombre||'Sin cuenta',r=>Number(r.monto)),manualIncomeByCategory:group(income,r=>r.categoria,r=>Number(r.monto)),surveys:surveyRows},proformas:rows,manualIncome:income.map(i=>({...i,monto:Number(i.monto)})),payments:cashPayments.map(p=>({id:p.id,fecha:p.fecha,monto:p.monto,proforma:p.proforma,cuenta:p.metodoPago.nombre}))};
  },{timeout:30000,isolationLevel:'RepeatableRead'});
  writeFileSync(`../backup_temp/audit-balances-${month}.json`,JSON.stringify(report,null,2));
  console.log(JSON.stringify({month,readOnly:report.readOnly,totals:report.totals},null,2));
} catch(e) { console.error(JSON.stringify({error:e.code||'AUDIT_FAILED',message:String(e.message).replace(/postgres(?:ql)?:\/\/\S+/g,'[redacted]')}));process.exitCode=1; }
finally {await db.$disconnect();}
