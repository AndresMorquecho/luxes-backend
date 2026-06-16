-- CreateTable
CREATE TABLE "clientes" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "cedula_ruc" TEXT NOT NULL DEFAULT '',
    "telefono" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "direccion" TEXT NOT NULL DEFAULT '',
    "tipo" TEXT NOT NULL DEFAULT 'Persona',
    "notas" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proformas" (
    "id" TEXT NOT NULL,
    "cliente_id" TEXT,
    "cliente_nombre" TEXT NOT NULL,
    "telefono" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "fecha" DATE NOT NULL,
    "vencimiento" DATE,
    "iva" DECIMAL(6,4) NOT NULL DEFAULT 0.12,
    "notas" TEXT NOT NULL DEFAULT '',
    "estado" TEXT NOT NULL DEFAULT 'Pendiente',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proformas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proforma_items" (
    "id" TEXT NOT NULL,
    "proforma_id" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "cantidad" DECIMAL(12,2) NOT NULL,
    "precio_unitario" DECIMAL(12,2) NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "proforma_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "proforma_items_proforma_id_idx" ON "proforma_items"("proforma_id");

-- AddForeignKey
ALTER TABLE "proformas" ADD CONSTRAINT "proformas_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proforma_items" ADD CONSTRAINT "proforma_items_proforma_id_fkey" FOREIGN KEY ("proforma_id") REFERENCES "proformas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
