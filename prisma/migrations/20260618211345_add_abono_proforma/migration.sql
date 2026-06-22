-- CreateTable
CREATE TABLE "abonos_proforma" (
    "id" TEXT NOT NULL,
    "proforma_id" TEXT NOT NULL,
    "metodo_pago_id" TEXT NOT NULL,
    "monto" DOUBLE PRECISION NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "referencia" TEXT,

    CONSTRAINT "abonos_proforma_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "abonos_proforma" ADD CONSTRAINT "abonos_proforma_proforma_id_fkey" FOREIGN KEY ("proforma_id") REFERENCES "proformas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "abonos_proforma" ADD CONSTRAINT "abonos_proforma_metodo_pago_id_fkey" FOREIGN KEY ("metodo_pago_id") REFERENCES "metodos_pago"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
