import type { Prisma, PrismaClient } from '@prisma/client';
import { lockOrder, money } from '../../features/compras/infrastructure/adapters/persistence/compraLifecycle.js';

export async function syncPurchaseBalance(tx: Prisma.TransactionClient, orderId: string) {
  const cxp = await tx.cuentaPorPagar.findUnique({ where: { ordenCompraId: orderId } });
  if (!cxp || cxp.estado === 'anulada') return;
  const sum = await tx.abonoCompra.aggregate({ where: { ordenCompraId: orderId }, _sum: { monto: true } });
  const paid = money(sum._sum.monto || 0), balance = money(Math.max(0, cxp.montoTotal - paid));
  await tx.cuentaPorPagar.update({ where: { id: cxp.id }, data: { montoPagado: paid, saldo: balance, estado: balance <= 0 ? 'pagado' : paid > 0 ? 'parcial' : 'pendiente' } });
  await tx.ordenCompra.update({ where: { id: orderId }, data: { estadoPago: balance <= 0 ? 'pagado' : paid > 0 ? 'parcial' : 'sin_pagar' } });
}
export async function addPurchasePayment(tx: Prisma.TransactionClient, data: { ordenCompraId: string; metodoPagoId: string; monto: number; referencia?: string; registradoPorUserId?: string | null }) {
  const cxp = await tx.cuentaPorPagar.findUnique({ where: { ordenCompraId: data.ordenCompraId } });
  if (!cxp || cxp.estado === 'anulada' || !Number.isFinite(data.monto) || data.monto <= 0 || data.monto > cxp.saldo + 0.000001) throw new Error('El pago excede la deuda vigente o la deuda fue anulada.');
  const row = await tx.abonoCompra.create({ data, include: { metodoPago: true, registradoPor: { select: { id: true, nombre: true } } } });
  await syncPurchaseBalance(tx, data.ordenCompraId);
  return row;
}
export async function processPurchaseCheque(db: PrismaClient, id: string) {
  const ref = await db.chequeCompra.findUniqueOrThrow({ where: { id } });
  return db.$transaction(async tx => {
    await lockOrder(tx, ref.ordenCompraId);
    const cheque = await tx.chequeCompra.findUniqueOrThrow({ where: { id } });
    if (cheque.procesado || cheque.estado !== 'PENDIENTE') return cheque;
    const order = await tx.ordenCompra.findUniqueOrThrow({ where: { id: cheque.ordenCompraId } });
    if (order.estado === 'anulada') return tx.chequeCompra.update({ where: { id }, data: { estado: 'CANCELADO' } });
    const existing = await tx.abonoCompra.findFirst({ where: { ordenCompraId: cheque.ordenCompraId, metodoPagoId: cheque.metodoPagoId, monto: cheque.monto, referencia: { contains: `Cheque N° ${cheque.numeroCheque}` } } });
    if (!existing) await addPurchasePayment(tx, { ordenCompraId: cheque.ordenCompraId, metodoPagoId: cheque.metodoPagoId, monto: cheque.monto, referencia: `Cobro Cheque N° ${cheque.numeroCheque}${cheque.referencia ? ` — ${cheque.referencia}` : ''}`, registradoPorUserId: cheque.registradoPorUserId });
    else await syncPurchaseBalance(tx, cheque.ordenCompraId);
    return tx.chequeCompra.update({ where: { id }, data: { estado: 'PROCESADO', procesado: true, notificado: true }, include: { ordenCompra: { include: { proveedor: true } }, metodoPago: true } });
  });
}
