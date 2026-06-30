ALTER TABLE "empleados" ADD COLUMN IF NOT EXISTS "region" TEXT NOT NULL DEFAULT 'costa';
ALTER TABLE "empleados" ADD COLUMN IF NOT EXISTS "decimo_tercero_mensualizado" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "empleados" ADD COLUMN IF NOT EXISTS "decimo_cuarto_mensualizado" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "nomina_config_global" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "sbu_vigente" DECIMAL(10,2) NOT NULL DEFAULT 470,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "nomina_config_global_pkey" PRIMARY KEY ("id")
);

INSERT INTO "nomina_config_global" ("id", "sbu_vigente", "updated_at")
VALUES ('default', 470, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
