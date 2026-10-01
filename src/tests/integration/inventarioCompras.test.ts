import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { receiveOrder, cancellationPreview, cancelOrder, type AnulacionInput } from '../../features/compras/infrastructure/adapters/persistence/compraLifecycle.js';
import { PrismaMaterialAdapter } from '../../features/inventario/infrastructure/adapters/persistence/prismaMaterialAdapter.js';

// Deliberately refuses all production connections. Requires an isolated local test schema.
const url = process.env.TEST_DATABASE_URL || 'postgresql://postgres@127.0.0.1:55439/luxes_inventory_test';
const parsed = new URL(url);
if (parsed.hostname !== '127.0.0.1' || parsed.port !== '55439' || parsed.pathname !== '/luxes_inventory_test') throw new Error('Tests require the isolated local database.');
process.env.DATABASE_URL = url;
process.env.VAPID_PUBLIC_KEY = ''; process.env.VAPID_PRIVATE_KEY = '';
const { PrismaComprasAdapter } = await import('../../features/compras/infrastructure/adapters/persistence/prismaComprasAdapter.js');
const { processPurchaseCheque } = await import('../../shared/services/compraPayments.js');
const { ComprasController } = await import('../../features/compras/infrastructure/adapters/http/comprasController.js');
const { ComprasService } = await import('../../features/compras/application/services/ComprasService.js');
const db = new PrismaClient({ datasourceUrl: url });
const inventory = new PrismaMaterialAdapter(db);
const repo = new PrismaComprasAdapter(db);
const user = await db.user.create({ data: { nombre: 'Integration test', username: randomUUID(), email: `${randomUUID()}@example.test`, passwordHash: 'not-a-login', rol: 'Administrador' } });
const account = await db.metodoPago.create({ data: { nombre: `Test ${randomUUID()}` } });
after(async () => { await db.$disconnect(); });

async function fixture(paid = 0, baseId?: string, quantity = 1) {
  const base = baseId ? await db.material.findUniqueOrThrow({ where: { id: baseId } }) : await db.material.create({ data: { nombre: `Vinil ${randomUUID()}`, tipo: 'consumible', categoria: 'Impresión', stockActual: 12 } });
  const order = await db.ordenCompra.create({ data: { numero: `TEST_${randomUUID()}`, usuarioId: user.id, estado: 'aprobada', total: 100, subtotal: 100,
    detalles: { create: { materialId: base.id, descripcion: base.nombre, cantidad: quantity, precioUnitario: 100 / quantity, subtotal: 100 } },
    cuentaPorPagar: { create: { montoTotal: 100, montoPagado: 0, saldo: 100 } },
  }, include: { detalles: true } });
  if (paid) await repo.createAbono({ ordenCompraId: order.id, metodoPagoId: account.id, monto: paid });
  return { base, order, detail: order.detalles[0]! };
}
async function received(paid = 0) {
  const f = await fixture(paid);
  await receiveOrder(db, f.order.id, user.id, { detalles: [{ detalleId: f.detail.id, materialId: f.base.id, cantidad: 50, descargableInventario: true }] });
  const roll = await db.material.findFirstOrThrow({ where: { materialBaseId: f.base.id } });
  return { ...f, roll };
}
async function preview(id: string) { return db.$transaction(tx => cancellationPreview(tx, id)); }
function input(p: Awaited<ReturnType<typeof cancellationPreview>>, extra: Partial<AnulacionInput> = {}): AnulacionInput {
  return { version: p.version, motivo: 'Devolución acordada con el proveedor', confirmarNumero: p.numero, deuda: 'cancelar', reembolso: { monto: 0 }, devoluciones: [], ...extra };
}

test('recepción crea rollo en metros, conserva base y rechaza repetición', async () => {
  const f = await received();
  assert.equal(f.roll.stockActual, 50);
  assert.equal(f.roll.codigo, 'R001');
  assert.equal((await db.unidadMedida.findUniqueOrThrow({ where: { id: f.roll.unidadMedidaId! } })).nombre, 'Metro');
  assert.equal((await db.material.findUniqueOrThrow({ where: { id: f.base.id } })).stockActual, 12);
  await assert.rejects(receiveOrder(db, f.order.id, user.id, { detalles: [{ detalleId: f.detail.id, cantidad: 50, descargableInventario: true }] }));
  assert.equal(await db.material.count({ where: { materialBaseId: f.base.id } }), 1);
});
test('fallo en segundo ítem revierte recepción, rollo y movimiento del primero', async () => {
  const f = await fixture();
  const free = await db.detalleCompra.create({ data: { ordenCompraId: f.order.id, descripcion: 'Sin vínculo', cantidad: 1, precioUnitario: 1 } });
  await assert.rejects(receiveOrder(db, f.order.id, user.id, { detalles: [{ detalleId: f.detail.id, cantidad: 50, descargableInventario: true }, { detalleId: free.id, cantidad: 50, descargableInventario: true }] }), /Vincula/);
  assert.equal((await db.detalleCompra.findUniqueOrThrow({ where: { id: f.detail.id } })).cantidadRecibida, null);
  assert.equal(await db.material.count({ where: { materialBaseId: f.base.id } }), 0);
});
test('recepciones simultáneas con huecos conservan consecutivos únicos y stock independiente', async () => {
  const first = await fixture();
  await db.material.create({ data: { nombre: `[R009] ${first.base.nombre}`, codigo: 'R009', materialBaseId: first.base.id, stockActual: 0, ocultado: true, tipo: 'consumible' } });
  const second = await fixture(0, first.base.id);
  await Promise.all([first, second].map(f => receiveOrder(db, f.order.id, user.id, { detalles: [{ detalleId: f.detail.id, cantidad: 50, descargableInventario: true }] })));
  const rolls = await db.material.findMany({ where: { materialBaseId: first.base.id }, orderBy: { codigo: 'asc' } });
  assert.deepEqual(rolls.map(r=>r.codigo), ['R009','R010','R011']);
});
test('varios rollos en una línea quedan separados', async () => {
  const f = await fixture(0, undefined, 2);
  await receiveOrder(db, f.order.id, user.id, { detalles: [{ detalleId: f.detail.id, cantidad: 95, rollos: [50,45], descargableInventario: true }] });
  const rolls = await db.material.findMany({ where: { materialBaseId: f.base.id }, orderBy: { codigo: 'asc' } });
  assert.deepEqual(rolls.map(r=>r.stockActual), [50,45]);
});
test('agotamiento decimal oculta, devolución reactiva y elimina base con historial se rechaza', async () => {
  const f = await received();
  await inventory.registrarMovimientoAtomico({ materialId: f.roll.id, tipo: 'salida', cantidad: 49.7, motivo: 'test' });
  await inventory.registrarMovimientoAtomico({ materialId: f.roll.id, tipo: 'salida', cantidad: 0.1, motivo: 'test' });
  await inventory.registrarMovimientoAtomico({ materialId: f.roll.id, tipo: 'salida', cantidad: 0.2, motivo: 'test' });
  assert.equal((await db.material.findUniqueOrThrow({ where: { id: f.roll.id } })).ocultado, true);
  await inventory.registrarMovimientoAtomico({ materialId: f.roll.id, tipo: 'entrada', cantidad: 5, motivo: 'devolución test' });
  assert.equal((await db.material.findUniqueOrThrow({ where: { id: f.roll.id } })).ocultado, false);
  await assert.rejects(inventory.delete(f.base.id), /historial/);
});
test('dos consumos simultáneos no generan stock negativo ni movimientos fantasma', async () => {
  const f = await received();
  const outcomes = await Promise.allSettled([1,2].map(()=>inventory.registrarMovimientoAtomico({ materialId:f.roll.id, tipo:'salida', cantidad:40, motivo:'test race' })));
  assert.equal(outcomes.filter(o=>o.status==='fulfilled').length,1);
  assert.equal((await db.material.findUniqueOrThrow({where:{id:f.roll.id}})).stockActual,10);
  assert.equal(await db.movimientoInventario.count({where:{materialId:f.roll.id,tipo:'salida'}}),1);
});
test('anulación pagada registra ingreso real, devolución parcial e historial; reintento no duplica', async () => {
  const f = await received(100);
  await inventory.registrarMovimientoAtomico({ materialId:f.roll.id,tipo:'salida',cantidad:10,motivo:'consumo' });
  const p = await preview(f.order.id);
  const body = input(p,{reembolso:{monto:60,metodoPagoId:account.id},devoluciones:[{materialId:f.roll.id,cantidad:20}]});
  const cashBefore = (await repo.findAllMetodosPago()).find(a => a.id === account.id)!.saldoActual!;
  await cancelOrder(db,f.order.id,user.id,body);
  await cancelOrder(db,f.order.id,user.id,body);
  const cashAfter = (await repo.findAllMetodosPago()).find(a => a.id === account.id)!.saldoActual!;
  assert.equal(Math.round((cashAfter - cashBefore) * 100), 6000);
  assert.equal((await db.ordenCompra.findUniqueOrThrow({where:{id:f.order.id}})).estado,'anulada');
  assert.equal((await db.ordenCompra.findUniqueOrThrow({where:{id:f.order.id}})).estadoPago,'anulado');
  assert.equal((await db.material.findUniqueOrThrow({where:{id:f.roll.id}})).stockActual,20);
  assert.equal(await db.abonoCompra.count({where:{ordenCompraId:f.order.id}}),1);
  assert.equal(await db.ingreso.count({where:{id:`reembolso-compra:${f.order.id}`}}),1);
  assert.equal(Number((await db.ingreso.findUniqueOrThrow({where:{id:`reembolso-compra:${f.order.id}`}})).monto),60);
  assert.equal((await db.cuentaPorPagar.findUniqueOrThrow({where:{ordenCompraId:f.order.id}})).estado,'anulada');
});
test('vista previa obsoleta y devolución excesiva se rechazan sin efectos', async () => {
  const f = await received(20), p=await preview(f.order.id);
  await repo.createAbono({ordenCompraId:f.order.id,metodoPagoId:account.id,monto:5});
  await assert.rejects(cancelOrder(db,f.order.id,user.id,input(p)),/saldos cambiaron/);
  const current=await preview(f.order.id);
  await assert.rejects(cancelOrder(db,f.order.id,user.id,input(current,{devoluciones:[{materialId:f.roll.id,cantidad:51}]})),/excede/);
  await assert.rejects(cancelOrder(db,f.order.id,user.id,input(current,{reembolso:{monto:26,metodoPagoId:account.id}})),/reembolso/);
  assert.equal((await db.ordenCompra.findUniqueOrThrow({where:{id:f.order.id}})).estado,'recibida');
  assert.equal(await db.ingreso.count({where:{id:`reembolso-compra:${f.order.id}`}}),0);
});
test('sin reembolso conserva caja, conserva deuda cobrable y cancela cheques pendientes', async () => {
  const f=await received(20);
  const cheque=await db.chequeCompra.create({data:{ordenCompraId:f.order.id,metodoPagoId:account.id,numeroCheque:randomUUID(),monto:80,fechaCobro:new Date('2099-01-01')}});
  await cancelOrder(db,f.order.id,user.id,input(await preview(f.order.id),{deuda:'conservar'}));
  await processPurchaseCheque(db,cheque.id);
  assert.equal((await db.chequeCompra.findUniqueOrThrow({where:{id:cheque.id}})).estado,'CANCELADO');
  await assert.rejects(repo.updateChequeCompra(cheque.id, { monto: 70 }), /vigentes/);
  await assert.rejects(repo.deleteChequeCompra(cheque.id), /historial/);
  assert.equal(await db.ingreso.count({where:{id:`reembolso-compra:${f.order.id}`}}),0);
  assert.equal((await db.cuentaPorPagar.findUniqueOrThrow({where:{ordenCompraId:f.order.id}})).saldo,80);
  await new ComprasService(repo).registrarAbono({ordenCompraId:f.order.id,metodoPagoId:account.id,monto:10});
  assert.equal((await db.cuentaPorPagar.findUniqueOrThrow({where:{ordenCompraId:f.order.id}})).saldo,70);
});
test('fallo de auditoría revierte salidas, deuda, cheques y estado juntos', async () => {
  const f=await received();
  const body=input(await preview(f.order.id),{devoluciones:[{materialId:f.roll.id,cantidad:50}]});
  await assert.rejects(cancelOrder(db,f.order.id,'missing-user-for-rollback',body));
  assert.equal((await db.material.findUniqueOrThrow({where:{id:f.roll.id}})).stockActual,50);
  assert.equal((await db.ordenCompra.findUniqueOrThrow({where:{id:f.order.id}})).estado,'recibida');
  assert.equal((await db.cuentaPorPagar.findUniqueOrThrow({where:{ordenCompraId:f.order.id}})).saldo,100);
});
test('API niega anulación y datos financieros a usuarios sin permiso', async () => {
  const ctrl=new ComprasController(new ComprasService(repo));
  let status=200;
  const res:any={status:(n:number)=>{status=n;return res;},json:(v:any)=>v};
  await ctrl.previewAnulacion({user:{id:user.id,rol:'Impresión',permissions:[]},params:{id:'not-needed'}} as any,res);
  assert.equal(status,403);
  await ctrl.deleteOrden({user:{id:user.id,rol:'Impresión',permissions:[]},params:{id:'not-needed'},body:{}} as any,res);
  assert.equal(status,403);
});
test('editar conserva número, pagos y cuenta de origen; un abono nuevo solo resta el adicional', async () => {
  const f=await fixture(40);
  const original=await db.abonoCompra.findFirstOrThrow({where:{ordenCompraId:f.order.id}});
  const edited=await repo.editarOrdenConReconciliacion(f.order.id,{impuesto:0,editadoPorId:user.id,detalles:[{id:f.detail.id,descripcion:f.detail.descripcion,cantidad:1,precioUnitario:120,materialId:f.base.id}],abonoMonto:10,metodoPagoId:account.id});
  assert.equal(edited.id,f.order.id);
  assert.equal(edited.numero,f.order.numero);
  assert.ok(await db.abonoCompra.findUnique({where:{id:original.id}}));
  assert.equal((await db.cuentaPorPagar.findUniqueOrThrow({where:{ordenCompraId:f.order.id}})).saldo,70);
  assert.equal((await db.abonoCompra.aggregate({where:{ordenCompraId:f.order.id},_sum:{monto:true}}))._sum.monto,50);
  await assert.rejects(repo.editarOrdenConReconciliacion(f.order.id,{impuesto:0,editadoPorId:user.id,detalles:[{id:f.detail.id,descripcion:f.detail.descripcion,cantidad:1,precioUnitario:10,materialId:f.base.id}]}),/menor a los pagos/);
});
test('edición parcial conserva detalle recibido y trazabilidad de los rollos', async () => {
  const f=await fixture();
  const other=await db.detalleCompra.create({data:{ordenCompraId:f.order.id,descripcion:'Otro',cantidad:1,precioUnitario:0}});
  await receiveOrder(db,f.order.id,user.id,{detalles:[{detalleId:f.detail.id,cantidad:50,descargableInventario:true}]});
  await repo.editarOrdenConReconciliacion(f.order.id,{impuesto:0,editadoPorId:user.id,detalles:[{id:f.detail.id,materialId:f.base.id,descripcion:f.detail.descripcion,cantidad:1,precioUnitario:100},{id:other.id,descripcion:'Otro',cantidad:1,precioUnitario:0}]});
  assert.equal((await db.detalleCompra.findUniqueOrThrow({where:{id:f.detail.id}})).cantidadRecibida,50);
  const p=await preview(f.order.id);
  assert.equal(p.sinTrazabilidad,false);
  assert.equal(p.materiales.length,1);
});
test('concurrencia de anulación y cheque no crea egreso después de anular', async () => {
  const f=await fixture();
  const cheque=await db.chequeCompra.create({data:{ordenCompraId:f.order.id,metodoPagoId:account.id,numeroCheque:randomUUID(),monto:100,fechaCobro:new Date('2099-01-01')}});
  const p=await preview(f.order.id);
  const outcomes=await Promise.allSettled([cancelOrder(db,f.order.id,user.id,input(p)),processPurchaseCheque(db,cheque.id)]);
  const order=await db.ordenCompra.findUniqueOrThrow({where:{id:f.order.id}});
  if(order.estado==='anulada') {
    assert.equal(await db.abonoCompra.count({where:{ordenCompraId:f.order.id}}),0);
    assert.equal((await db.chequeCompra.findUniqueOrThrow({where:{id:cheque.id}})).estado,'CANCELADO');
  } else {
    assert.equal(outcomes[0]!.status,'rejected');
    assert.equal(await db.abonoCompra.count({where:{ordenCompraId:f.order.id}}),1);
  }
});
