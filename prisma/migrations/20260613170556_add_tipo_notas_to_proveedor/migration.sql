-- AlterTable
ALTER TABLE "proveedores" ADD COLUMN     "notas" TEXT,
ADD COLUMN     "tipo" TEXT NOT NULL DEFAULT 'Empresa';
