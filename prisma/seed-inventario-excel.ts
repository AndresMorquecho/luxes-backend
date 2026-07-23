/**
 * Carga el inventario preparado (Taller / Oficina / Impresión) en la tabla materiales.
 *
 * Archivos fuente (deben existir en el repo):
 *   inventario-listo-importar/listo_importar_taller.xlsx
 *   inventario-listo-importar/listo_importar_oficina.xlsx
 *   inventario-listo-importar/listo_importar_impresion.xlsx
 *
 * Uso local:
 *   npm run db:seed-inventario
 *
 * Uso producción (con DATABASE_URL de prod en el entorno o en .env):
 *   CONFIRM_SEED_INVENTARIO=1 npm run db:seed-inventario
 *
 * Solo simular (no escribe):
 *   DRY_RUN=1 npm run db:seed-inventario
 *
 * Evita duplicar ítems con el mismo codigo+categoria (si tienen código).
 */
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';
import { config as loadEnv } from 'dotenv';
import {
  parseImportExcelBuffer,
  type CategoriaInventario,
} from '../src/features/inventario/application/utils/inventarioImportUtils.js';

loadEnv();

const prisma = new PrismaClient();
const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'inventario-listo-importar');

const FILES: Array<{ file: string; categoria: CategoriaInventario }> = [
  { file: 'listo_importar_taller.xlsx', categoria: 'Taller' },
  { file: 'listo_importar_oficina.xlsx', categoria: 'Oficina' },
  { file: 'listo_importar_impresion.xlsx', categoria: 'Impresión' },
];

/** Lee columnas extra del Excel (código/marca/etc.) aunque el subtipo no las exija. */
async function readExtraFieldsByLine(buffer: Buffer): Promise<Map<number, {
  codigo?: string;
  marca?: string;
  modelo?: string;
  serie?: string;
  estadoUso?: string;
  aCargo?: string;
}>> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);
  const sheet = workbook.getWorksheet('Productos') ?? workbook.worksheets[0];
  const map = new Map<number, {
    codigo?: string;
    marca?: string;
    modelo?: string;
    serie?: string;
    estadoUso?: string;
    aCargo?: string;
  }>();
  if (!sheet) return map;

  const headers: string[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col - 1] = normalizeKey(cell.value);
  });

  const idx = (name: string) => headers.findIndex((h) => h === name);

  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber < 2) return;
    const get = (name: string) => {
      const i = idx(name);
      if (i < 0) return '';
      const v = row.getCell(i + 1).value;
      return String(v ?? '').trim();
    };
    map.set(rowNumber, {
      codigo: get('codigo') || undefined,
      marca: get('marca') || undefined,
      modelo: get('modelo') || undefined,
      serie: get('serie') || undefined,
      estadoUso: get('estado_uso') || undefined,
      aCargo: get('responsable') || undefined,
    });
  });

  return map;
}

function normalizeKey(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

async function resolveUnidadBase() {
  const all = await prisma.unidadMedida.findMany();
  const found = all.find((u) => {
    const n = normalizeKey(u.nombre);
    const a = normalizeKey(u.abreviacion);
    return n === 'unidad' || n === 'unidades' || a === 'und' || a === 'u';
  });
  if (found) return found;

  return prisma.unidadMedida.create({
    data: { nombre: 'Unidad', abreviacion: 'und' },
  });
}

async function main() {
  const dryRun = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';
  const confirm = process.env.CONFIRM_SEED_INVENTARIO === '1' || process.env.CONFIRM_SEED_INVENTARIO === 'true';
  const nodeEnv = process.env.NODE_ENV || 'development';

  if (!process.env.DATABASE_URL) {
    throw new Error('Falta DATABASE_URL. Configúrala en .env o en la variable de entorno.');
  }

  // En producción exige confirmación explícita
  if (nodeEnv === 'production' && !confirm && !dryRun) {
    throw new Error(
      'Producción detectada. Ejecuta con CONFIRM_SEED_INVENTARIO=1 (o DRY_RUN=1 para simular).',
    );
  }

  console.log('DATA_DIR:', DATA_DIR);
  console.log('NODE_ENV:', nodeEnv);
  console.log('DRY_RUN:', dryRun);
  console.log('DATABASE_URL host:', process.env.DATABASE_URL.replace(/:[^:@]+@/, ':***@'));

  for (const { file } of FILES) {
    const full = join(DATA_DIR, file);
    if (!existsSync(full)) {
      throw new Error(`No se encontró el archivo: ${full}`);
    }
  }

  const unidad = await resolveUnidadBase();
  let unidades = await prisma.unidadMedida.findMany();

  // Alias: si el Excel trae "unidades" y en DB está "Unidad", el parser necesita coincidencia.
  // Añadimos un alias temporal en memoria para el parseo.
  if (!unidades.some((u) => normalizeKey(u.nombre) === 'unidades')) {
    unidades = [
      ...unidades,
      { id: unidad.id, nombre: 'unidades', abreviacion: unidad.abreviacion },
      { id: unidad.id, nombre: 'Unidad', abreviacion: unidad.abreviacion },
    ];
  }

  console.log('Unidad base:', unidad.nombre, `(${unidad.id})`);

  const before = await prisma.material.count();
  console.log('Materiales antes:', before);

  let createdTotal = 0;
  let skippedTotal = 0;
  let failedTotal = 0;

  for (const { file, categoria } of FILES) {
    const buf = readFileSync(join(DATA_DIR, file));
    const { rows, errors } = await parseImportExcelBuffer(buf, categoria, unidades);
    const extras = await readExtraFieldsByLine(buf);

    console.log(`\n=== ${categoria} (${file}) ===`);
    console.log(`Filas válidas: ${rows.length} | Errores parseo: ${errors.length}`);
    if (errors.length) {
      console.log('Primeros errores:', JSON.stringify(errors.slice(0, 5), null, 2));
    }

    let created = 0;
    let skipped = 0;
    let failed = 0;

    for (const row of rows) {
      const p = row.payload;
      const extra = extras.get(row.line) || {};
      const codigo = p.codigo || extra.codigo;
      const marca = p.marca || extra.marca;
      const modelo = p.modelo || extra.modelo;
      const serie = p.serie || extra.serie;
      const estadoUso = p.estadoUso || extra.estadoUso || 'BODEGA';
      const aCargo = p.aCargo || extra.aCargo;
      try {
        if (codigo) {
          const exists = await prisma.material.findFirst({
            where: { codigo, categoria: p.categoria },
            select: { id: true },
          });
          if (exists) {
            skipped += 1;
            continue;
          }
        }

        if (dryRun) {
          created += 1;
          continue;
        }

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
            codigo: codigo || null,
            marca: marca || null,
            modelo: modelo || null,
            serie: serie || null,
            estadoUso,
            aCargo: aCargo || null,
          },
        });
        created += 1;
      } catch (err) {
        failed += 1;
        const message = err instanceof Error ? err.message : String(err);
        console.error(`  FAIL L${row.line} ${row.nombre}:`, message);
      }
    }

    createdTotal += created;
    skippedTotal += skipped;
    failedTotal += failed;
    console.log(`Creados: ${created} | Omitidos (código ya existe): ${skipped} | Fallidos: ${failed}`);
  }

  const after = dryRun ? before : await prisma.material.count();
  const byCat = await prisma.material.groupBy({ by: ['categoria'], _count: true });

  console.log('\n=== RESUMEN ===');
  console.log({
    dryRun,
    createdTotal,
    skippedTotal,
    failedTotal,
    before,
    after,
    byCat,
  });

  if (dryRun) {
    console.log('\nSimulación terminada. Nada se escribió en la base.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
