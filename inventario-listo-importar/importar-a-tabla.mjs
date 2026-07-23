import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { PrismaClient } from '@prisma/client';
import { parseImportExcelBuffer } from '../dist/features/inventario/application/utils/inventarioImportUtils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();

const FILES = [
  { file: 'listo_importar_taller.xlsx', categoria: 'Taller' },
  { file: 'listo_importar_oficina.xlsx', categoria: 'Oficina' },
  { file: 'listo_importar_impresion.xlsx', categoria: 'Impresión' },
];

async function ensureUnidadUnidades() {
  const all = await prisma.unidadMedida.findMany();
  const found = all.find((u) => {
    const n = String(u.nombre || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const a = String(u.abreviacion || '').toLowerCase();
    return n === 'unidades' || n === 'unidad' || a === 'und' || a === 'u';
  });
  if (found) return found;

  return prisma.unidadMedida.create({
    data: { nombre: 'Unidad', abreviacion: 'und' },
  });
}

async function main() {
  const unidad = await ensureUnidadUnidades();
  const unidades = await prisma.unidadMedida.findMany();
  console.log('Unidad base:', unidad.nombre, unidad.id);
  console.log('Unidades en DB:', unidades.map((u) => u.nombre).join(', '));

  const before = await prisma.material.count();
  console.log('Materiales antes:', before);

  let createdTotal = 0;
  let failedTotal = 0;

  for (const { file, categoria } of FILES) {
    const buf = readFileSync(join(__dirname, file));
    const { rows, errors } = await parseImportExcelBuffer(buf, categoria, unidades);

    console.log(`\n=== ${categoria} (${file}) ===`);
    console.log(`Filas válidas: ${rows.length} | Errores parseo: ${errors.length}`);
    if (errors.length) {
      console.log('Errores:', JSON.stringify(errors.slice(0, 5), null, 2));
    }

    let created = 0;
    let failed = 0;

    for (const row of rows) {
      const p = row.payload;
      try {
        await prisma.material.create({
          data: {
            nombre: p.nombre,
            tipo: p.tipo,
            subtipo: p.subtipo,
            descargaStock: p.descargaStock,
            esPrestable: p.esPrestable,
            categoria: p.categoria,
            stockActual: p.stockActual,
            stockMinimo: p.stockMinimo,
            precioCosto: p.precioCosto,
            unidadMedidaId: p.unidadMedidaId || unidad.id,
            codigo: p.codigo || null,
            marca: p.marca || null,
            modelo: p.modelo || null,
            serie: p.serie || null,
            estadoUso: p.estadoUso || 'BODEGA',
            aCargo: p.aCargo || null,
          },
        });
        created += 1;
      } catch (err) {
        failed += 1;
        console.error(`  FAIL L${row.line} ${row.nombre}:`, err.message);
      }
    }

    createdTotal += created;
    failedTotal += failed;
    console.log(`Creados: ${created} | Fallidos: ${failed}`);
  }

  const after = await prisma.material.count();
  const byCat = await prisma.material.groupBy({ by: ['categoria'], _count: true });

  console.log('\n=== RESUMEN ===');
  console.log({ createdTotal, failedTotal, before, after, byCat });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
