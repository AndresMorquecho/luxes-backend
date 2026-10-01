import { createHash } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { parseDateOnly } from '../../../../../shared/utils/dateOnly.js';

type Tx = Prisma.TransactionClient;
import type { RecepcionInput, AnulacionInput, AnulacionPreview } from '../../../domain/types/CompraLifecycle.js';
export type { RecepcionInput, AnulacionInput } from '../../../domain/types/CompraLifecycle.js';
export const lockOrder = (tx: Tx, id: string) => tx.$queryRaw`SELECT id FROM ordenes_compra WHERE id = ${id} FOR UPDATE`;
export const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const roundStock = (n: number) => Math.round(n * 1e6) / 1e6;
const requirePositive = (n: number) => { if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) throw new Error('La cantidad debe ser un número mayor a cero.'); };

export async function createRoll(tx: Tx, data: { materialBaseId: string; metros: number; ordenNumero: string; userId?: string | null; precioCosto?: number; detalleId?: string }) {
  requirePositive(data.metros);
  const given = await tx.material.findUniqueOrThrow({ where: { id: data.materialBaseId } });
  const rootId = given.materialBaseId || given.id;
  // Serialize numbering and protect the root against concurrent deletion.
  await tx.$queryRaw`SELECT id FROM materiales WHERE id = ${rootId} FOR UPDATE`;
  const base = await tx.material.findUnique({ where: { id: rootId } });
  if (!base) throw new Error('El material base no existe. Repara el vínculo antes de recibir.');
  const siblings = await tx.material.findMany({ where: { materialBaseId: rootId }, select: { codigo: true, nombre: true } });
  const max = siblings.reduce((n, m) => Math.max(n, Number(m.codigo?.match(/^R(\d+)$/)?.[1] || m.nombre.match(/^\[R(\d+)\]/)?.[1] || 0)), 0);
  const code = `R${String(max + 1).padStart(3, '0')}`;
  const unit = await tx.unidadMedida.upsert({ where: { nombre: 'Metro' }, update: {}, create: { nombre: 'Metro', abreviacion: 'm' } });
  const row = await tx.material.create({ data: {
    nombre: `[${code}] ${base.nombre.replace(/^\[R\d+\]\s*/, '')}`, codigo: code,
    materialBaseId: rootId, tipo: 'consumible', subtipo: 'consumible_descargable', descargaStock: true,
    unidadMedidaId: unit.id, categoria: base.categoria, ancho: base.ancho,
    stockActual: data.metros, stockMinimo: 0, precioCosto: data.precioCosto ?? base.precioCosto, ocultado: false,
  } });
  await tx.movimientoInventario.create({ data: {
    materialId: row.id, tipo: 'entrada', cantidad: data.metros, userId: data.userId || null,
    motivo: `Recepción OC ${data.ordenNumero} — Rollo ${code.slice(1)} ingresado al inventario${data.detalleId ? ` [detalle:${data.detalleId}]` : ''}`,
  } });
  return { id: row.id, nombre: row.nombre };
}

export async function receiveOrder(db: PrismaClient, id: string, userId: string, input: RecepcionInput) {
  return db.$transaction(async tx => {
    await lockOrder(tx, id);
    const order = await tx.ordenCompra.findUniqueOrThrow({ where: { id }, include: { detalles: true } });
    if (!['aprobada', 'parcialmente_recibida'].includes(order.estado)) throw new Error('Solo se pueden recibir órdenes aprobadas o parcialmente recibidas.');
    if (!Array.isArray(input.detalles) || !input.detalles.length) throw new Error('Incluye los ítems a recibir.');
    const ids = new Set<string>();
    for (const item of input.detalles) {
      requirePositive(item.cantidad);
      const detail = order.detalles.find(d => d.id === item.detalleId);
      if (!detail || ids.has(detail.id)) throw new Error('Ítem inexistente o duplicado.');
      ids.add(detail.id);
      if ((detail.cantidadRecibida || 0) > 0) throw new Error(`El ítem "${detail.descripcion}" ya fue recepcionado.`);
      const downloadable = item.descargableInventario === true;
      if (item.materialId && item.materialId !== detail.materialId) throw new Error('El material debe coincidir con el de la orden.');
      if (downloadable && !detail.materialId) throw new Error('Vincula el ítem a un material antes de ingresarlo al inventario.');
      const date = parseDateOnly(item.fechaRecepcion || input.fechaRecepcion || '') || new Date();
      if (downloadable) {
        const lengths = item.rollos || [item.cantidad];
        if (!lengths.length || lengths.length > 1000) throw new Error('Cantidad de rollos inválida.');
        lengths.forEach(requirePositive);
        if (Math.abs(lengths.reduce((a, b) => a + b, 0) - item.cantidad) > 0.000001) throw new Error('La suma de metros por rollo debe coincidir con la cantidad recibida.');
        if (Number.isInteger(detail.cantidad) && detail.cantidad > 1 && lengths.length !== detail.cantidad) throw new Error(`Indica los metros de cada uno de los ${detail.cantidad} rollos.`);
        for (const metros of lengths) await createRoll(tx, { materialBaseId: detail.materialId!, metros, ordenNumero: order.numero, userId, precioCosto: detail.precioUnitario, detalleId: detail.id });
      }
      await tx.detalleCompra.update({ where: { id: detail.id }, data: { cantidadRecibida: item.cantidad, descargableInventario: downloadable, fechaRecepcion: date } });
    }
    const details = await tx.detalleCompra.findMany({ where: { ordenCompraId: id } });
    return tx.ordenCompra.update({ where: { id }, data: {
      estado: details.every(d => (d.cantidadRecibida || 0) > 0) ? 'recibida' : 'parcialmente_recibida',
      fechaRecepcion: new Date(Math.max(...details.filter(d => d.fechaRecepcion).map(d => d.fechaRecepcion!.getTime()))),
      recibidoPorId: userId, notasRecepcion: input.notasRecepcion ?? order.notasRecepcion,
    }, include: { detalles: true } });
  }, { timeout: 30000 });
}

export async function cancellationPreview(tx: Tx, id: string): Promise<AnulacionPreview> {
  const order = await tx.ordenCompra.findUniqueOrThrow({ where: { id }, include: {
    detalles: { orderBy: { id: 'asc' } }, abonos: { orderBy: { id: 'asc' }, include: { metodoPago: true } },
    cuentaPorPagar: true, cheques: { orderBy: { id: 'asc' } }, proveedor: true,
  } });
  // Legacy receipts have no formal purchase FK; only accept the exact receipt prefix.
  const entries = await tx.movimientoInventario.findMany({ where: { tipo: 'entrada', motivo: { startsWith: `Recepción OC ${order.numero} —` } }, include: { material: { include: { unidadMedida: true } } }, orderBy: { id: 'asc' } });
  const materials = [...new Set(entries.map(e => e.materialId))].map(materialId => {
    const lines = entries.filter(e => e.materialId === materialId);
    const m = lines[0]!.material;
    const received = lines.reduce((sum, e) => sum + e.cantidad, 0);
    return { materialId, nombre: m.nombre, codigo: m.codigo, unidad: m.unidadMedida?.abreviacion || '', recibido: received, disponible: m.stockActual, maxDevolver: Math.max(0, Math.min(received, m.stockActual)) };
  });
  const receivedDetails = order.detalles.filter(d => d.descargableInventario && (d.cantidadRecibida || 0) > 0);
  const sinTrazabilidad = receivedDetails.some(d => {
    const tagged = entries.filter(e => e.motivo.includes(`[detalle:${d.id}]`));
    if (tagged.length) return Math.abs(tagged.reduce((s,e)=>s+e.cantidad,0) - (d.cantidadRecibida || 0)) > 0.000001;
    return !entries.some(e => e.material.materialBaseId === d.materialId || e.materialId === d.materialId);
  });
  const record = await tx.auditLog.findUnique({ where: { id: `anulacion-compra:${id}` } });
  const data = {
    id, numero: order.numero, estado: order.estado, proveedor: order.proveedor?.nombre || '',
    total: order.total, pagado: money(order.abonos.reduce((s,a)=>s+a.monto,0)), saldo: order.cuentaPorPagar?.saldo || 0,
    pagos: order.abonos.map(a=>({ id:a.id, monto:a.monto, cuenta:a.metodoPago.nombre })),
    chequesPendientes: order.cheques.filter(c => !c.procesado && c.estado === 'PENDIENTE').map(c=>({id:c.id, numero:c.numeroCheque, monto:c.monto})),
    materiales: materials, sinTrazabilidad, anulacion: record ? JSON.parse(record.detalle) : null,
  };
  return { ...data, version: createHash('sha256').update(JSON.stringify({ data, detalles: order.detalles, cheques: order.cheques, cuenta: order.cuentaPorPagar })).digest('hex') };
}

export function validateCancellation(p: Awaited<ReturnType<typeof cancellationPreview>>, input: AnulacionInput) {
  if (!input || input.version !== p.version) throw new Error('Los saldos cambiaron. Actualiza la vista previa antes de confirmar.');
  if (typeof input.motivo !== 'string' || input.motivo.trim().length < 10 || input.motivo.length > 2000) throw new Error('Escribe un motivo de entre 10 y 2000 caracteres.');
  if (input.confirmarNumero !== p.numero) throw new Error('Escribe el número de la orden para confirmar.');
  if (!['conservar', 'cancelar'].includes(input.deuda)) throw new Error('Elige qué hacer con la deuda.');
  const refund = input.reembolso?.monto;
  if (typeof refund !== 'number' || !Number.isFinite(refund) || refund < 0 || refund > p.pagado || Math.abs(money(refund) - refund) > 1e-8) throw new Error('El reembolso debe estar entre cero y lo efectivamente pagado, con dos decimales.');
  if (refund > 0 && !input.reembolso.metodoPagoId) throw new Error('Selecciona la cuenta que recibió el reembolso.');
  if (p.sinTrazabilidad && input.aceptarSinTrazabilidad !== true) throw new Error('Confirma que las recepciones sin trazabilidad quedarán sin ajuste automático.');
  if (!Array.isArray(input.devoluciones)) throw new Error('Indica las devoluciones de inventario.');
  const seen = new Set<string>();
  for (const row of input.devoluciones) {
    requirePositive(row.cantidad);
    const material = p.materiales.find(m => m.materialId === row.materialId);
    if (!material || seen.has(row.materialId) || row.cantidad > material.maxDevolver) throw new Error('La devolución excede lo recibido/disponible o repite un material.');
    seen.add(row.materialId);
  }
}

export async function cancelOrder(db: PrismaClient, id: string, userId: string, input: AnulacionInput) {
  return db.$transaction(async tx => {
    await lockOrder(tx, id);
    const existing = await tx.auditLog.findUnique({ where: { id: `anulacion-compra:${id}` } });
    if (existing) return JSON.parse(existing.detalle); // Retry after a lost response never repeats effects.
    let preview = await cancellationPreview(tx, id);
    for (const m of [...preview.materiales].sort((a,b)=>a.materialId.localeCompare(b.materialId))) await tx.$queryRaw`SELECT id FROM materiales WHERE id = ${m.materialId} FOR UPDATE`;
    preview = await cancellationPreview(tx, id);
    validateCancellation(preview, input);
    if (preview.estado === 'anulada') throw new Error('Esta orden ya está anulada.');
    if (input.reembolso.monto > 0) {
      const refundDate = parseDateOnly(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' }))!;
      const closed = await tx.cierreCaja.findFirst({ where: { fechaInicio: { lte: refundDate }, fechaFin: { gte: refundDate } } });
      if (closed) throw new Error('La caja de hoy está cerrada. Registra el reembolso en un período abierto.');
      const account = await tx.metodoPago.findUnique({ where: { id: input.reembolso.metodoPagoId! } });
      if (!account?.activo) throw new Error('La cuenta de reembolso no está activa.');
      await tx.ingreso.create({ data: {
        id: `reembolso-compra:${id}`, concepto: `Reembolso por anulación ${preview.numero}`, categoria: 'Reembolso de compra', fecha: refundDate,
        monto: input.reembolso.monto, metodoPagoId: account.id, cliente: preview.proveedor,
        notas: input.motivo.trim(), registradoPorUserId: userId,
      } });
    }
    for (const row of input.devoluciones) {
      const m = await tx.material.findUniqueOrThrow({ where: { id: row.materialId } });
      const stock = roundStock(m.stockActual - row.cantidad);
      if (stock < 0) throw new Error('El stock cambió. Actualiza la vista previa.');
      await tx.material.update({ where: { id: m.id }, data: { stockActual: stock, ...(m.materialBaseId ? { ocultado: stock <= 0 } : {}) } });
      await tx.movimientoInventario.create({ data: { materialId: m.id, tipo: 'salida', cantidad: row.cantidad, motivo: `Devolución por anulación ${preview.numero}: ${input.motivo.trim()}`, userId } });
    }
    await tx.chequeCompra.updateMany({ where: { ordenCompraId: id, estado: 'PENDIENTE', procesado: false }, data: { estado: 'CANCELADO' } });
    if (input.deuda === 'cancelar') await tx.cuentaPorPagar.updateMany({ where: { ordenCompraId: id }, data: { saldo: 0, estado: 'anulada' } });
    await tx.ordenCompra.update({ where: { id }, data: { estado: 'anulada', ...(input.deuda === 'cancelar' ? { estadoPago: 'anulado' } : {}) } });
    const result = { fecha: new Date().toISOString(), userId, numero: preview.numero, motivo: input.motivo.trim(), decisiones: input, antes: preview, reembolsoRegistrado: input.reembolso.monto, deudaRestante: input.deuda === 'conservar' ? preview.saldo : 0 };
    await tx.auditLog.create({ data: { id: `anulacion-compra:${id}`, userId, accion: 'Anular orden de compra', modulo: 'Compras', severidad: 'warning', detalle: JSON.stringify(result) } });
    return result;
  }, { timeout: 30000 });
}
