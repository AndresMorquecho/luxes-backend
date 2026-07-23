-- AlterTable
ALTER TABLE "empleados" ADD COLUMN IF NOT EXISTS "decimo_tercero_valor" DECIMAL(10,2);
ALTER TABLE "empleados" ADD COLUMN IF NOT EXISTS "decimo_cuarto_valor" DECIMAL(10,2);
ALTER TABLE "empleados" ADD COLUMN IF NOT EXISTS "iess_valor" DECIMAL(10,2);
