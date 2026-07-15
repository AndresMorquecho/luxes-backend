/**
 * Repara migraciones Prisma en estado fallido (P3009) en producción.
 * Se ejecuta antes de `prisma migrate deploy` en el contenedor.
 */
import { PrismaClient } from '@prisma/client';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const prisma = new PrismaClient();
const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

type MigrationRow = {
  migration_name: string;
  finished_at: Date | null;
  rolled_back_at: Date | null;
};

/** SQL idempotente por migración (tiene prioridad sobre migration.sql) */
const REPAIRS: Record<string, string[]> = {
  '20260625140000_add_nomina_periodo_config': [
    `CREATE TABLE IF NOT EXISTS "nomina_periodo_config" (
      "id" TEXT NOT NULL,
      "fecha_inicio" DATE NOT NULL,
      "fecha_fin" DATE NOT NULL,
      "feriados" JSONB NOT NULL DEFAULT '[]',
      "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "nomina_periodo_config_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "nomina_periodo_config_fecha_inicio_fecha_fin_key"
      ON "nomina_periodo_config"("fecha_inicio", "fecha_fin")`,
  ],
  '20260625150000_add_horarios_laborales': [
    `ALTER TABLE "configuracion" ADD COLUMN IF NOT EXISTS "horarios_laborales" JSONB`,
  ],
  '20260625160000_hora_extra_aprobacion': [
    `ALTER TABLE "horas_extras" ADD COLUMN IF NOT EXISTS "aprobacion_estado" TEXT NOT NULL DEFAULT 'APROBADA'`,
    `ALTER TABLE "horas_extras" ADD COLUMN IF NOT EXISTS "origen" TEXT NOT NULL DEFAULT 'MANUAL'`,
    `ALTER TABLE "horas_extras" ADD COLUMN IF NOT EXISTS "asistencia_fin_id" TEXT`,
  ],
  '20260625180000_decimos_provisiones': [
    `ALTER TABLE "empleados" ADD COLUMN IF NOT EXISTS "region" TEXT NOT NULL DEFAULT 'costa'`,
    `ALTER TABLE "empleados" ADD COLUMN IF NOT EXISTS "decimo_tercero_mensualizado" BOOLEAN NOT NULL DEFAULT false`,
    `ALTER TABLE "empleados" ADD COLUMN IF NOT EXISTS "decimo_cuarto_mensualizado" BOOLEAN NOT NULL DEFAULT false`,
    `CREATE TABLE IF NOT EXISTS "nomina_config_global" (
      "id" TEXT NOT NULL DEFAULT 'default',
      "sbu_vigente" DECIMAL(10,2) NOT NULL DEFAULT 470,
      "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "nomina_config_global_pkey" PRIMARY KEY ("id")
    )`,
    `INSERT INTO "nomina_config_global" ("id", "sbu_vigente", "updated_at")
      VALUES ('default', 470, CURRENT_TIMESTAMP)
      ON CONFLICT ("id") DO NOTHING`,
  ],
  '20260703180000_add_inventario_subtipo_descarga_prestable': [
    `ALTER TABLE "materiales" ADD COLUMN IF NOT EXISTS "subtipo" TEXT DEFAULT 'consumible_descargable'`,
    `ALTER TABLE "materiales" ADD COLUMN IF NOT EXISTS "descarga_stock" BOOLEAN NOT NULL DEFAULT true`,
    `ALTER TABLE "materiales" ADD COLUMN IF NOT EXISTS "es_prestable" BOOLEAN NOT NULL DEFAULT false`,
    `UPDATE "materiales" 
      SET subtipo = 'herramienta', 
          descarga_stock = false, 
          es_prestable = true 
      WHERE tipo = 'herramienta' AND subtipo IS NULL`,
    `UPDATE "materiales" 
      SET subtipo = 'consumible_registro', 
          descarga_stock = false, 
          es_prestable = false 
      WHERE tipo = 'consumible' AND categoria = 'Taller' AND subtipo IS NULL`,
    `UPDATE "materiales" 
      SET subtipo = 'activo_fijo', 
          descarga_stock = false, 
          es_prestable = false 
      WHERE tipo = 'consumible' AND categoria = 'Oficina' AND subtipo IS NULL`,
    `UPDATE "materiales" 
      SET subtipo = 'consumible_registro', 
          descarga_stock = false, 
          es_prestable = false 
      WHERE tipo = 'consumible' 
        AND categoria = 'Impresión' 
        AND LOWER(nombre) LIKE '%tinta%' AND subtipo IS NULL`,
    `UPDATE "materiales" 
      SET subtipo = 'consumible_descargable', 
          descarga_stock = true, 
          es_prestable = false 
      WHERE tipo = 'consumible' 
        AND categoria = 'Impresión' 
        AND LOWER(nombre) NOT LIKE '%tinta%' AND subtipo IS NULL`,
  ],
  '20260706150000_add_registrado_por_movimientos': [
    `ALTER TABLE "abonos_proforma" ADD COLUMN IF NOT EXISTS "registrado_por_user_id" TEXT`,
    `ALTER TABLE "gastos" ADD COLUMN IF NOT EXISTS "registrado_por_user_id" TEXT`,
    `ALTER TABLE "abonos_compra" ADD COLUMN IF NOT EXISTS "registrado_por_user_id" TEXT`,
    `CREATE INDEX IF NOT EXISTS "abonos_proforma_registrado_por_user_id_idx" ON "abonos_proforma"("registrado_por_user_id")`,
    `CREATE INDEX IF NOT EXISTS "gastos_registrado_por_user_id_idx" ON "gastos"("registrado_por_user_id")`,
    `CREATE INDEX IF NOT EXISTS "abonos_compra_registrado_por_user_id_idx" ON "abonos_compra"("registrado_por_user_id")`,
    `DO $$ 
      BEGIN 
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints 
          WHERE constraint_name = 'abonos_proforma_registrado_por_user_id_fkey'
        ) THEN 
          ALTER TABLE "abonos_proforma" ADD CONSTRAINT "abonos_proforma_registrado_por_user_id_fkey" 
          FOREIGN KEY ("registrado_por_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;
      END $$`,
    `DO $$ 
      BEGIN 
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints 
          WHERE constraint_name = 'gastos_registrado_por_user_id_fkey'
        ) THEN 
          ALTER TABLE "gastos" ADD CONSTRAINT "gastos_registrado_por_user_id_fkey" 
          FOREIGN KEY ("registrado_por_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;
      END $$`,
    `DO $$ 
      BEGIN 
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints 
          WHERE constraint_name = 'abonos_compra_registrado_por_user_id_fkey'
        ) THEN 
          ALTER TABLE "abonos_compra" ADD CONSTRAINT "abonos_compra_registrado_por_user_id_fkey" 
          FOREIGN KEY ("registrado_por_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;
      END $$`,
  ],
};

function loadStatementsFromFile(migrationName: string): string[] {
  const filePath = path.join(MIGRATIONS_DIR, migrationName, 'migration.sql');
  if (!fs.existsSync(filePath)) return [];

  const content = fs.readFileSync(filePath, 'utf8');
  return content
    .split(';')
    .map((s) => s.replace(/^--[^\n]*\n?/gm, '').trim())
    .filter(Boolean);
}

function getStatements(migrationName: string): string[] {
  if (REPAIRS[migrationName]?.length) return REPAIRS[migrationName];
  return loadStatementsFromFile(migrationName);
}

async function getPendingFailedMigrations(): Promise<MigrationRow[]> {
  return prisma.$queryRaw<MigrationRow[]>`
    SELECT migration_name, finished_at, rolled_back_at
    FROM "_prisma_migrations"
    WHERE finished_at IS NULL
      AND rolled_back_at IS NULL
    ORDER BY started_at ASC
  `;
}

async function main() {
  const failed = await getPendingFailedMigrations();

  if (failed.length === 0) {
    console.log('[Migrations] No hay migraciones fallidas pendientes.');
    return;
  }

  console.log(
    `[Migrations] Migraciones fallidas detectadas: ${failed.map((f) => f.migration_name).join(', ')}`,
  );

  for (const row of failed) {
    const statements = getStatements(row.migration_name);
    if (statements.length === 0) {
      throw new Error(
        `[Migrations] Sin SQL de reparación para "${row.migration_name}". ` +
          'Agrega la migración en prisma/fix-failed-migrations.ts',
      );
    }

    console.log(`[Migrations] Reparando: ${row.migration_name}`);

    for (const statement of statements) {
      await prisma.$executeRawUnsafe(statement);
    }

    execSync(`npx prisma migrate resolve --applied ${row.migration_name}`, {
      stdio: 'inherit',
      env: process.env,
    });

    console.log(`[Migrations] ✓ ${row.migration_name} marcada como aplicada.`);
  }
}

main()
  .catch((err) => {
    console.error('[Migrations] Error reparando migraciones fallidas:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
