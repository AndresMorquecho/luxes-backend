// Script de limpieza: elimina duplicados ATRASO_QR de hoy y recalcula multa correcta
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const HOY = new Date();
const ahoraEC = new Date(HOY.getTime() - 5 * 3600000);
const dateStr = ahoraEC.toISOString().split('T')[0];
console.log('Limpiando ATRASO_QR duplicados del día:', dateStr);

function calcularMulta(atrasoMin, tol = 8) {
  if (atrasoMin <= tol) return 0;
  const exceso = atrasoMin - tol;
  if (exceso <= 8) return 2;
  if (exceso <= 16) return 3;
  return 4;
}

const registros = await prisma.nominaRegistro.findMany({});

let fixed = 0;
for (const reg of registros) {
  const egr = typeof reg.egresos === 'string' ? JSON.parse(reg.egresos) : (reg.egresos || {});
  const permisos = Array.isArray(egr.permisosDetalle) ? egr.permisosDetalle : [];

  const atrasoHoy = permisos.filter(p => p.fecha === dateStr && p.tipo === 'ATRASO_QR');
  if (atrasoHoy.length === 0) continue;

  console.log(`\nEmpleado ${reg.empleadoId} | ATRASO_QR hoy: ${atrasoHoy.length}`);
  atrasoHoy.forEach(p => console.log(`  - motivo="${p.motivo}" | horas=${p.horas} | multaDolares=${p.multaDolares} | atrasoMin=${p.atrasoMinutos}`));

  // Quedarnos con el mejor registro (el que tiene atrasoMinutos definido)
  const conMinutos = atrasoHoy.filter(p => p.atrasoMinutos !== undefined);
  const sinMinutos = atrasoHoy.filter(p => p.atrasoMinutos === undefined);

  // Filtrar todos los ATRASO_QR de hoy del array base
  const base = permisos.filter(p => !(p.fecha === dateStr && p.tipo === 'ATRASO_QR'));

  let multaFinal = 0;
  let mejorRegistro = null;

  if (conMinutos.length > 0) {
    // Tomar el primero con atrasoMinutos (son todos iguales, mismo scan)
    mejorRegistro = conMinutos[0];
    multaFinal = calcularMulta(mejorRegistro.atrasoMinutos, 8);
  }

  const nuevosPermisos = [...base];
  if (multaFinal > 0 && mejorRegistro) {
    nuevosPermisos.push({
      ...mejorRegistro,
      horas: multaFinal,
      multaDolares: multaFinal,
      motivo: `Atraso entrada QR ${mejorRegistro.horaMarcacion ?? '??:??'} (+${mejorRegistro.atrasoMinutos} min)`,
    });
  }

  const newPermisoHoras = nuevosPermisos
    .filter(r => !r.eliminado)
    .reduce((sum, item) => sum + Number(item.multaDolares ?? item.horas ?? 0), 0);

  await prisma.nominaRegistro.update({
    where: { id: reg.id },
    data: {
      permisoHoras: newPermisoHoras,
      egresos: { ...egr, permisosDetalle: nuevosPermisos },
    }
  });

  console.log(`  -> CORREGIDO: multa=$${multaFinal} | permisoHoras=${newPermisoHoras}`);
  fixed++;
}

console.log(`\n✅ Total registros corregidos: ${fixed}`);
await prisma.$disconnect();
