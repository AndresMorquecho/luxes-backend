import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const IMPRESION_KEYWORDS =
  /lona|vinil|tinta|laminaci[oó]n|pvc|tela|sublim|transfer|solvente|banner|microperfor|impresi[oó]n/i;

async function main() {
  const all = await prisma.material.findMany({
    select: { id: true, nombre: true, tipo: true, categoria: true },
  });

  let toImpresion = 0;
  let toTaller = 0;
  let toOficina = 0;

  for (const m of all) {
    const nombre = m.nombre || '';

    if (m.categoria === 'Oficina') {
      continue;
    }

    if (m.tipo === 'herramienta') {
      if (m.categoria !== 'Taller') {
        await prisma.material.update({
          where: { id: m.id },
          data: { categoria: 'Taller' },
        });
        toTaller++;
      }
      continue;
    }

    if (IMPRESION_KEYWORDS.test(nombre)) {
      if (m.categoria !== 'Impresión') {
        await prisma.material.update({
          where: { id: m.id },
          data: { categoria: 'Impresión' },
        });
        toImpresion++;
      }
      continue;
    }

    if (!m.categoria || m.categoria === 'Impresión') {
      // Consumibles genéricos de taller (acrílico, cinta, etc.)
      const target = 'Taller';
      if (m.categoria !== target) {
        await prisma.material.update({
          where: { id: m.id },
          data: { categoria: target },
        });
        toTaller++;
      }
    }
  }

  const counts = await prisma.material.groupBy({
    by: ['categoria'],
    _count: { id: true },
    orderBy: { categoria: 'asc' },
  });

  console.log('✓ Inventario reclasificado');
  console.log(`  → Impresión: ${toImpresion} actualizados`);
  console.log(`  → Taller: ${toTaller} actualizados`);
  console.log(`  → Oficina: sin cambios (${toOficina})`);
  console.log('\nResumen por categoría:');
  for (const row of counts) {
    console.log(`  ${row.categoria || '(sin categoría)'}: ${row._count.id}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
