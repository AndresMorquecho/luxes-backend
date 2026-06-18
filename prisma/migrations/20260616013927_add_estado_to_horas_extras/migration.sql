/*
  Warnings:

  - You are about to drop the column `notas` on the `abonos_compra` table. All the data in the column will be lost.
  - You are about to drop the `site_settings` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterTable
ALTER TABLE "abonos_compra" DROP COLUMN "notas";

-- AlterTable
ALTER TABLE "horas_extras" ADD COLUMN     "estado" TEXT NOT NULL DEFAULT 'DEUDOR';

-- DropTable
DROP TABLE "site_settings";
