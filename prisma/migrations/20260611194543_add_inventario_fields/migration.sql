-- DropIndex
DROP INDEX "materiales_nombre_key";

-- AlterTable
ALTER TABLE "materiales" ADD COLUMN     "a_cargo" TEXT,
ADD COLUMN     "categoria" TEXT DEFAULT 'Taller',
ADD COLUMN     "codigo" TEXT,
ADD COLUMN     "estado_uso" TEXT DEFAULT 'BODEGA',
ADD COLUMN     "marca" TEXT,
ADD COLUMN     "modelo" TEXT,
ADD COLUMN     "serie" TEXT;
