-- AlterTable
ALTER TABLE "empleados" ADD COLUMN IF NOT EXISTS "password_hash" TEXT NOT NULL DEFAULT '';
