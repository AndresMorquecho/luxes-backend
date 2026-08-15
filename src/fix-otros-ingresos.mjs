import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('Buscando registros de nomina con ingresos OTROS sin contabilizar...');
  const otrosIngresos = await prisma.ingresoDetalle.findMany({
    where: { tipo: 'OTROS' },
    orderBy: { fecha: 'asc' }
  });
  console.log(`Encontrados ${otrosIngresos.length} registros de tipo OTROS`);

  const updatedPayrolls = new Set();
  let fixedCount = 0;
  let skippedCount = 0;

  for (const ingreso of otrosIngresos) {
    const fIngreso = ingreso.fecha;
    const payroll = await prisma.nominaRegistro.findFirst({
      where: {
        empleadoId: ingreso.empleadoId,
        fechaInicio: { lte: fIngreso },
        fechaFin: { gte: fIngreso }
      }
    });

    if (!payroll) { skippedCount++; continue; }
    if (updatedPayrolls.has(payroll.id)) continue;
    updatedPayrolls.add(payroll.id);

    const allIngresos = await prisma.ingresoDetalle.findMany({
      where: {
        empleadoId: ingreso.empleadoId,
        fecha: { gte: payroll.fechaInicio, lte: payroll.fechaFin }
      }
    });

    let trabEmpSum = 0;
    let otrosSum = 0;
    for (const i of allIngresos) {
      const mVal = Number(i.monto);
      if (i.tipo === 'TRAB_EMP') trabEmpSum += mVal;
      else if (i.tipo === 'OTROS') otrosSum += mVal;
    }

    const currentIngresos = payroll.ingresos || {};
    const currentOtros = currentIngresos.otrosIngresos ? Number(currentIngresos.otrosIngresos) : 0;
    if (Math.abs(currentOtros - otrosSum) < 0.001) continue;

    const updatedIngresos = { ...currentIngresos, trabajosEnEmpresa: trabEmpSum, otrosIngresos: otrosSum };
    await prisma.nominaRegistro.update({ where: { id: payroll.id }, data: { ingresos: updatedIngresos } });
    fixedCount++;
    const fi = payroll.fechaInicio.toISOString().split('T')[0];
    const ff = payroll.fechaFin.toISOString().split('T')[0];
    console.log(`  CORREGIDO empleado ${ingreso.empleadoId} (${fi}~${ff}): otrosIngresos = $${otrosSum}`);
  }

  console.log(`\nFix completado: ${fixedCount} nominas corregidas, ${skippedCount} sin nomina asociada`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
