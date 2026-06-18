-- AlterTable
ALTER TABLE "proformas" ADD COLUMN     "atiende" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "condiciones" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "dias_validez" INTEGER NOT NULL DEFAULT 3;

-- CreateTable
CREATE TABLE "configuracion" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "condiciones_pago" TEXT NOT NULL DEFAULT '',
    "celular" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "direccion" TEXT NOT NULL DEFAULT '',
    "dias_validez" INTEGER NOT NULL DEFAULT 3,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configuracion_pkey" PRIMARY KEY ("id")
);
