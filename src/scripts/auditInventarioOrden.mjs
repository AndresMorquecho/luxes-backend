// Run from luxes-backend: node src/scripts/auditInventarioOrden.mjs [ORC_022_2026]
// No application imports, writes, migrations, or schedulers. PostgreSQL enforces READ ONLY.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({ log: [] });
const numero = process.argv[2] || 'ORC_022_2026';
try {
  const report = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '12000ms'");
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '2000ms'");
    const mode = await tx.$queryRawUnsafe('SHOW transaction_read_only');
    if (mode[0]?.transaction_read_only !== 'on') throw new Error('Read-only guard failed');
    const materialSelect = {
      id: true, nombre: true, codigo: true, categoria: true, subtipo: true,
      stockActual: true, ocultado: true, materialBaseId: true, ancho: true,
      descargaStock: true, fechaCreacion: true,
      unidadMedida: { select: { nombre: true, abreviacion: true } },
    };
    const orden = await tx.ordenCompra.findUnique({
      where: { numero },
      select: {
        id: true, numero: true, estado: true, fechaRecepcion: true,
        usuario: { select: { rol: true } },
        detalles: { select: {
          id: true, descripcion: true, cantidad: true, cantidadRecibida: true,
          descargableInventario: true, materialId: true, fechaRecepcion: true,
          material: { select: materialSelect },
        } },
      },
    });
    const relacionados = await tx.material.findMany({
      where: { OR: [
        { nombre: { contains: 'STARTECH', mode: 'insensitive' } },
        { nombre: { contains: 'LAMINACION', mode: 'insensitive' } },
        { codigo: 'MAT_674427' },
      ] }, select: materialSelect, take: 150, orderBy: { fechaCreacion: 'asc' },
    });
    const movimientosOrden = await tx.movimientoInventario.findMany({
      where: { motivo: { contains: numero } },
      select: { id: true, tipo: true, cantidad: true, motivo: true, fecha: true, material: { select: materialSelect } },
      orderBy: { fecha: 'asc' }, take: 100,
    });
    const rollos = await tx.material.findMany({
      where: { categoria: 'Impresión' }, select: materialSelect,
      orderBy: { fechaCreacion: 'asc' }, take: 1500,
    });
    const agotadosVisibles = rollos.filter(m => m.materialBaseId && m.descargaStock && m.stockActual <= 0 && !m.ocultado);
    const positivosOcultos = rollos.filter(m => m.stockActual > 0 && m.ocultado);
    const familias = [...new Set(rollos.filter(m => m.materialBaseId).map(m => m.materialBaseId))].map(id => ({
      base: rollos.find(m => m.id === id),
      rollos: rollos.filter(m => m.materialBaseId === id),
    }));
    const ids = [...new Set([...relacionados, ...rollos.filter(m => m.materialBaseId)].map(m => m.id))];
    const movimientos = await tx.movimientoInventario.findMany({
      where: { materialId: { in: ids } },
      select: { materialId: true, tipo: true, cantidad: true, motivo: true, fecha: true },
      orderBy: { fecha: 'asc' }, take: 1500,
    });
    const referencedBaseIds = [...new Set([...relacionados, ...rollos].map(m => m.materialBaseId).filter(Boolean))];
    const referencedBases = await tx.material.findMany({ where: { id: { in: referencedBaseIds } }, select: materialSelect });
    const missingBases = referencedBaseIds.filter(id => !referencedBases.some(m => m.id === id));
    const relevantIds = [...new Set([...relacionados.map(m => m.id), ...referencedBaseIds, orden?.id].filter(Boolean))];
    const auditLogs = await tx.auditLog.findMany({
      where: { fecha: { gte: new Date('2026-09-25T00:00:00Z') }, OR: [
        ...relevantIds.map(id => ({ detalle: { contains: id } })),
        { detalle: { contains: 'STARTECH', mode: 'insensitive' } },
        { detalle: { contains: numero } },
      ] },
      select: { fecha: true, accion: true, modulo: true, detalle: true },
      orderBy: { fecha: 'asc' }, take: 150,
    });
    return { readOnly: mode, numero, orden, relacionados, movimientosOrden, familias, agotadosVisibles, positivosOcultos, movimientos,
      referencedBases, missingBases, auditLogs,
      limits: { materialesImpresion: 1500, movimientos: 1500, relacionados: 150 } };
  }, { maxWait: 5000, timeout: 45000, isolationLevel: 'RepeatableRead' });
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  // Do not emit connection URLs or credentials on connection errors.
  console.error(JSON.stringify({ auditFailed: true, code: error.code || error.name }));
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
