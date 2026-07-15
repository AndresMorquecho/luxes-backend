import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const empleado = await prisma.empleado.findFirst({
    where: { nombre: { contains: 'Morquecho', mode: 'insensitive' } }
  });

  if (!empleado) {
    console.log('No se encontro el empleado');
    return;
  }

  console.log('Empleado:', empleado.id, empleado.nombre);

  const registros = await prisma.nominaRegistro.findMany({
    where: { empleadoId: empleado.id }
  });

  console.log('Registros de nomina:');
  for (const r of registros) {
    console.log({
      id: r.id,
      fechaInicio: r.fechaInicio,
      fechaFin: r.fechaFin,
      permisoHoras: r.permisoHoras,
      egresos: typeof r.egresos === 'string' ? JSON.parse(r.egresos) : r.egresos,
      ingresos: typeof r.ingresos === 'string' ? JSON.parse(r.ingresos) : r.ingresos,
    });
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
