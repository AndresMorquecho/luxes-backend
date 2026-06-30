/**
 * Repara migraciones Prisma en estado fallido (P3009) en producción.
 * Se ejecuta antes de `prisma migrate deploy` en el contenedor.
 */
import { PrismaClient } from '@prisma/client';
import { execSync } from 'node:child_process';

const prisma = new PrismaClient();

type MigrationRow = {
  migration_name: string;
  finished_at: Date | null;
  rolled_back_at: Date | null;
};

/** Migraciones que fallaron a medias: SQL idempotente + migrate resolve --applied */
const REPAIRS: Record<
  string,
  { label: string; sql: string[] }
> = {
  '20260625140000_add_nomina_periodo_config': {
    label: 'nomina_periodo_config',
    sql: [
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
  },
};

async function getPendingFailedMigrations(): Promise<MigrationRow[]> {
  const rows = await prisma.$queryRaw<MigrationRow[]>`
    SELECT migration_name, finished_at, rolled_back_at
    FROM "_prisma_migrations"
    WHERE finished_at IS NULL
      AND rolled_back_at IS NULL
    ORDER BY started_at ASC
  `;
  return rows.filter((r) => REPAIRS[r.migration_name]);
}

async function main() {
  const failed = await getPendingFailedMigrations();
  if (failed.length === 0) {
    console.log('[Migrations] No hay migraciones fallidas conocidas que reparar.');
    return;
  }

  for (const row of failed) {
    const repair = REPAIRS[row.migration_name];
    console.log(`[Migrations] Reparando migración fallida: ${row.migration_name} (${repair.label})`);

    for (const statement of repair.sql) {
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
