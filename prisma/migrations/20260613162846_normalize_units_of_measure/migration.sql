-- CreateTable
CREATE TABLE "unidades_medida" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "abreviacion" TEXT,

    CONSTRAINT "unidades_medida_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "unidades_medida_nombre_key" ON "unidades_medida"("nombre");

-- AddColumn in materiales
ALTER TABLE "materiales" ADD COLUMN "unidad_medida_id" TEXT;

-- Seed default units
INSERT INTO "unidades_medida" ("id", "nombre") VALUES
(md5('metros')::uuid::text, 'metros'),
(md5('unidades')::uuid::text, 'unidades'),
(md5('litros')::uuid::text, 'litros'),
(md5('rollos')::uuid::text, 'rollos'),
(md5('hojas')::uuid::text, 'hojas'),
(md5('planchas')::uuid::text, 'planchas')
ON CONFLICT ("nombre") DO NOTHING;

-- Seed any other distinct units currently in the database to prevent orphaned records
INSERT INTO "unidades_medida" ("id", "nombre")
SELECT md5(trim(lower("unidad_medida")))::uuid::text, trim(lower("unidad_medida"))
FROM "materiales"
WHERE "unidad_medida" IS NOT NULL AND "unidad_medida" <> ''
ON CONFLICT ("nombre") DO NOTHING;

-- Link materials to units
UPDATE "materiales"
SET "unidad_medida_id" = md5(trim(lower("unidad_medida")))::uuid::text
WHERE "unidad_medida" IS NOT NULL AND "unidad_medida" <> '';

-- Default link to 'unidades' for any materials that didn't have a valid match
UPDATE "materiales"
SET "unidad_medida_id" = md5('unidades')::uuid::text
WHERE "unidad_medida_id" IS NULL;

-- AddForeignKey constraint
ALTER TABLE "materiales" ADD CONSTRAINT "materiales_unidad_medida_id_fkey" FOREIGN KEY ("unidad_medida_id") REFERENCES "unidades_medida"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Drop old column
ALTER TABLE "materiales" DROP COLUMN "unidad_medida";
