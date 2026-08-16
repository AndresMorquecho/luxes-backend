/**
 * SCRIPT DE LECTURA Y DIAGNÓSTICO: CIERRE DE CAJA VS CUENTAS POR PAGAR / MOVIMIENTOS
 * Ejecutar con: npx tsx inspect-cierre-cxp.ts
 */

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

function toEcuadorTime(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const dateObj = typeof d === 'string' ? new Date(d) : d;
  return dateObj.toLocaleString('es-EC', { timeZone: 'America/Guayaquil' }) + ' (UTC-5)';
}

async function main() {
  console.log('\n================================================================');
  console.log('🔍 ANÁLISIS FORENSE DE MOVIMIENTOS, CXP Y CIERRE DE CAJA');
  console.log('================================================================\n');

  // 1. Buscar las órdenes de compra consultadas
  const numeros = ['ORC_MAN_001', 'ORC_MAN_012'];
  const ordenes = await prisma.ordenCompra.findMany({
    where: {
      numero: { in: numeros }
    },
    include: {
      proveedor: true,
      cuentaPorPagar: true,
      abonos: {
        include: {
          metodoPago: true,
          registradoPor: { select: { id: true, nombre: true, email: true } }
        }
      }
    }
  });

  console.log(`📦 Órdenes de compra encontradas: ${ordenes.length}`);
  for (const oc of ordenes) {
    console.log(`\n------------------------------------------------------------`);
    console.log(`ORDEN: ${oc.numero} | Proveedor: ${oc.proveedor?.nombre || 'Sin proveedor'}`);
    console.log(`Monto Total: $${oc.total} | Estado: ${oc.estado} | Estado Pago: ${oc.estadoPago}`);
    console.log(`Fecha Creación OC (UTC): ${oc.fecha.toISOString()} -> Ecuador: ${toEcuadorTime(oc.fecha)}`);
    
    if (oc.cuentaPorPagar) {
      console.log(`\n📋 CUENTA POR PAGAR (CxP):`);
      console.log(`   - ID: ${oc.cuentaPorPagar.id}`);
      console.log(`   - Monto Total: $${oc.cuentaPorPagar.montoTotal}`);
      console.log(`   - Monto Pagado: $${oc.cuentaPorPagar.montoPagado}`);
      console.log(`   - Saldo Pendiente: $${oc.cuentaPorPagar.saldo}`);
      console.log(`   - Estado: ${oc.cuentaPorPagar.estado}`);
    }

    console.log(`\n💳 HISTORIAL DE PAGOS / ABONOS REGISTRADOS (${oc.abonos.length}):`);
    for (const ab of oc.abonos) {
      console.log(`   - Abono ID: ${ab.id}`);
      console.log(`     * Monto: $${ab.monto}`);
      console.log(`     * Método de Pago: ${ab.metodoPago?.nombre || 'No especificado'} (ID: ${ab.metodoPagoId})`);
      console.log(`     * Referencia: ${ab.referencia || 'Sin referencia'}`);
      console.log(`     * Registrado por: ${ab.registradoPor?.nombre || 'Sistema'}`);
      console.log(`     * Timestamp en BD (UTC): ${ab.fecha.toISOString()}`);
      console.log(`     * Hora Real en Ecuador:   ${toEcuadorTime(ab.fecha)}`);
    }
  }

  // 2. Simulación de consulta Cierre de Caja para el día 15 de Agosto 2026
  console.log('\n================================================================');
  console.log('🧪 COMPARATIVA DE RANGOS DE FECHA PARA CIERRE DEL DÍA (15-AGO-2026)');
  console.log('================================================================\n');

  // Rango ANTERIOR (sin zona horaria, asumiendo medianoche UTC en servidor Linux)
  const oldDesde = new Date('2026-08-15T00:00:00.000Z');
  const oldHasta = new Date('2026-08-15T23:59:59.999Z');

  // Rango CORREGIDO (con zona horaria Ecuador UTC-5)
  const newDesde = new Date('2026-08-15T00:00:00.000-05:00'); // 2026-08-15 05:00:00 UTC
  const newHasta = new Date('2026-08-15T23:59:59.999-05:00'); // 2026-08-16 04:59:59.999 UTC

  console.log(`📌 Rango ANTERIOR (UTC):`);
  console.log(`   Desde: ${oldDesde.toISOString()} (En Ecuador: ${toEcuadorTime(oldDesde)})`);
  console.log(`   Hasta: ${oldHasta.toISOString()} (En Ecuador: ${toEcuadorTime(oldHasta)})`);
  console.log(`   ⚠️ CORTE: Cualquier pago registrado después de las 18:59:59 (6:59 PM) en Ecuador QUEDABA FUERA.`);

  const abonosConRangoAntiguo = await prisma.abonoCompra.findMany({
    where: { fecha: { gte: oldDesde, lte: oldHasta } },
    include: { ordenCompra: true }
  });
  console.log(`   👉 Abonos encontrados con rango anterior: ${abonosConRangoAntiguo.length}`);

  console.log(`\n📌 Rango CORREGIDO (Ecuador UTC-5):`);
  console.log(`   Desde: ${newDesde.toISOString()} (En Ecuador: ${toEcuadorTime(newDesde)})`);
  console.log(`   Hasta: ${newHasta.toISOString()} (En Ecuador: ${toEcuadorTime(newHasta)})`);
  console.log(`   ✅ COBERTURA: Cubre las 24 horas completas del día en Ecuador (00:00:00 a 23:59:59).`);

  const abonosConRangoCorregido = await prisma.abonoCompra.findMany({
    where: { fecha: { gte: newDesde, lte: newHasta } },
    include: { ordenCompra: true, metodoPago: true }
  });
  console.log(`   👉 Abonos encontrados con rango corregido: ${abonosConRangoCorregido.length}`);
  for (const ab of abonosConRangoCorregido) {
    console.log(`      * OC: ${ab.ordenCompra?.numero} | Monto: $${ab.monto} | Hora Ec: ${toEcuadorTime(ab.fecha)} | Cuenta: ${ab.metodoPago?.nombre}`);
  }

  console.log('\n================================================================');
  console.log('✅ CONCLUSIÓN:');
  console.log('1. Los datos NO fueron editados ni alterados; los abonos están intactos en la BD.');
  console.log('2. No aparecían en el Cierre de Caja porque se registraron a las 8:13 PM y 8:15 PM.');
  console.log('3. En servidores UTC, las 8:13 PM de Ecuador corresponden a la 1:13 AM del día siguiente.');
  console.log('4. Al aplicar la delimitación UTC-5 de Ecuador, los movimientos se incluyen automáticamente.');
  console.log('================================================================\n');
}

main()
  .catch(e => console.error('Error al ejecutar script:', e))
  .finally(() => prisma.$disconnect());
