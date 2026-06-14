/*
  Warnings:

  - Added the required column `usuario_id` to the `ordenes_compra` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ordenes_compra" ADD COLUMN     "concepto" TEXT,
ADD COLUMN     "usuario_id" TEXT NOT NULL,
ALTER COLUMN "estado" SET DEFAULT 'pendiente_aprobacion';

-- AddForeignKey
ALTER TABLE "ordenes_compra" ADD CONSTRAINT "ordenes_compra_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
