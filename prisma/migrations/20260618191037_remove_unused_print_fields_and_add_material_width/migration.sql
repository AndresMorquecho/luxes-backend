-- AlterTable
ALTER TABLE "gastos" ADD COLUMN     "metodo_pago_id" TEXT,
ADD COLUMN     "proyecto_id" TEXT;

-- AlterTable
ALTER TABLE "materiales" ADD COLUMN     "ancho" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "ordenes_compra" ADD COLUMN     "proyecto_id" TEXT;

-- AlterTable
ALTER TABLE "proformas" ADD COLUMN     "metodo_pago_id" TEXT;

-- AlterTable
ALTER TABLE "vehiculo_mantenimientos" ADD COLUMN     "gasto_id" TEXT;

-- CreateTable
CREATE TABLE "impresion_jobs" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "copies" INTEGER NOT NULL DEFAULT 1,
    "responsible" TEXT,
    "status" TEXT NOT NULL DEFAULT 'En espera',
    "format" TEXT NOT NULL,
    "elapsed_seconds" INTEGER NOT NULL DEFAULT 0,
    "sent_by" TEXT NOT NULL,
    "sent_at" TEXT NOT NULL,
    "sent_to_queue_at" TEXT,
    "started_printing_at" TEXT,
    "start_time" TEXT,
    "completed_at" TEXT,
    "file_url" TEXT,
    "client" TEXT NOT NULL,
    "urgency" TEXT NOT NULL DEFAULT 'Media',
    "width" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "height" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "notes" TEXT NOT NULL DEFAULT '',
    "proyecto_id" TEXT,
    "proyecto_nombre" TEXT,
    "cancel_reason" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "impresion_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cierres_caja" (
    "id" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_inicio" DATE NOT NULL,
    "fecha_fin" DATE NOT NULL,
    "total_ingresos" DECIMAL(12,2) NOT NULL,
    "total_egresos" DECIMAL(12,2) NOT NULL,
    "balance" DECIMAL(12,2) NOT NULL,
    "metodos_detalle" TEXT NOT NULL DEFAULT '[]',
    "observaciones" TEXT NOT NULL DEFAULT '',
    "usuario_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cierres_caja_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ordenes_compra" ADD CONSTRAINT "ordenes_compra_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proformas" ADD CONSTRAINT "proformas_metodo_pago_id_fkey" FOREIGN KEY ("metodo_pago_id") REFERENCES "metodos_pago"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_metodo_pago_id_fkey" FOREIGN KEY ("metodo_pago_id") REFERENCES "metodos_pago"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehiculo_mantenimientos" ADD CONSTRAINT "vehiculo_mantenimientos_gasto_id_fkey" FOREIGN KEY ("gasto_id") REFERENCES "gastos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "impresion_jobs" ADD CONSTRAINT "impresion_jobs_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cierres_caja" ADD CONSTRAINT "cierres_caja_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
