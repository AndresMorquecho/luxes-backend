-- AlterTable
ALTER TABLE "ordenes_compra" ADD COLUMN     "aprobado_por_id" TEXT,
ADD COLUMN     "fecha_aprobacion" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "ordenes_compra" ADD CONSTRAINT "ordenes_compra_aprobado_por_id_fkey" FOREIGN KEY ("aprobado_por_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
