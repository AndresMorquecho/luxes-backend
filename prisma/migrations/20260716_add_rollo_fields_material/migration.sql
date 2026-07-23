-- Migration: add_rollo_fields_material
-- Agrega campos para gestión de rollos individuales en inventario de impresión

ALTER TABLE "materiales" ADD COLUMN IF NOT EXISTS "ocultado" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "materiales" ADD COLUMN IF NOT EXISTS "material_base_id" TEXT;

-- Índice para búsquedas por material base
CREATE INDEX IF NOT EXISTS "materiales_material_base_id_idx" ON "materiales"("material_base_id");
