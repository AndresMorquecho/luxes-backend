import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { writeFileSync } from 'node:fs';
const db = new PrismaClient({ log: [] });
const apply = process.argv.includes('--apply');
const rollId = '10ecac8c-ed6b-4c84-abf5-9d75e5e30769';
const baseId = 'd68ffdbc-aec6-4c3a-9756-65fbca319545';
const detailId = '2b28c141-57fb-449e-a911-1086b6c43002';
try {
  const result = await db.$transaction(async tx => {
    if (!apply) await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '3000ms'");
    if (apply) await tx.$queryRaw`SELECT id FROM materiales WHERE id = ${rollId} FOR UPDATE`;
    const roll = await tx.material.findUniqueOrThrow({ where: { id: rollId } });
    const base = await tx.material.findUnique({ where: { id: baseId } });
    const detail = await tx.detalleCompra.findUniqueOrThrow({ where: { id: detailId } });
    const entry = await tx.movimientoInventario.findFirst({ where: { materialId: rollId, tipo: 'entrada', cantidad: 50, motivo: { contains: 'ORC_022_2026' } } });
    if (!entry || roll.stockActual !== 50 || roll.materialBaseId !== baseId || detail.cantidadRecibida !== 50) throw new Error('PRECONDITION_CHANGED');
    const unit = await tx.unidadMedida.findUniqueOrThrow({ where: { nombre: 'Metro' } });
    const before = { roll, base, detail };
    if (roll.categoria === 'Impresión' && roll.unidadMedidaId === unit.id && base && detail.materialId === baseId) return { alreadyRepaired: true, rollId };
    if (base || detail.materialId || roll.categoria !== 'Taller') throw new Error('PRECONDITION_CHANGED');
    if (!apply) return { dryRun: true, rollId, stockPreserved: 50, categoria: 'Impresión', unidad: 'Metro', restoreBaseWithoutStock: baseId, duplicateUntouched: 'af874057-5b0d-42bc-986b-0c649135d265' };
    writeFileSync(`../backup_temp/startech-before-${Date.now()}.json`, JSON.stringify(before, null, 2));
    await tx.material.create({ data: {
      id: baseId, nombre: roll.nombre.replace(/^\[R\d+\]\s*/, ''), tipo: roll.tipo,
      unidadMedidaId: unit.id, stockActual: 0, stockMinimo: 0,
      precioCosto: roll.precioCosto, categoria: 'Impresión', subtipo: 'consumible_descargable',
      descargaStock: true, ancho: 1.52,
    } });
    const after = await tx.material.update({ where: { id: rollId }, data: { categoria: 'Impresión', unidadMedidaId: unit.id, ancho: 1.52 } });
    await tx.detalleCompra.update({ where: { id: detailId }, data: { materialId: baseId } });
    await tx.auditLog.create({ data: { accion: 'Corrección de clasificación y vínculo STARTECH', modulo: 'Inventario', severidad: 'info', usuarioNom: 'Corrección autorizada por usuario vía Codex', detalle: JSON.stringify({ orden: 'ORC_022_2026', before, after, restoredBaseId: baseId, stockChanged: false, duplicateUntouched: true }) } });
    return { repaired: true, rollId, stock: after.stockActual, categoria: after.categoria, unidad: unit.nombre, baseRestored: baseId };
  }, { isolationLevel: 'Serializable', timeout: 15000 });
  console.log(JSON.stringify(result));
} catch (error) { console.error(JSON.stringify({ failed: true, code: error.code || error.message?.replace(/postgres(?:ql)?:\/\/\S+/g, '[redacted]') })); process.exitCode = 1; }
finally { await db.$disconnect(); }
