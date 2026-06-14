-- CreateTable
CREATE TABLE "gastos" (
    "id" TEXT NOT NULL,
    "concepto" TEXT NOT NULL,
    "categoria" TEXT NOT NULL DEFAULT 'oficina',
    "fecha" DATE NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "proveedor" TEXT NOT NULL DEFAULT '',
    "notas" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gastos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehiculos" (
    "id" TEXT NOT NULL,
    "placa" TEXT NOT NULL,
    "marca" TEXT NOT NULL DEFAULT '',
    "modelo" TEXT NOT NULL DEFAULT '',
    "anio" INTEGER,
    "color" TEXT NOT NULL DEFAULT '',
    "kilometraje" INTEGER NOT NULL DEFAULT 0,
    "responsable" TEXT NOT NULL DEFAULT '',
    "notas" TEXT NOT NULL DEFAULT '',
    "estado" TEXT NOT NULL DEFAULT 'activo',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehiculos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehiculo_mantenimientos" (
    "id" TEXT NOT NULL,
    "vehiculo_id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL DEFAULT '',
    "fecha_realizado" DATE NOT NULL,
    "fecha_proxima" DATE,
    "kilometraje" INTEGER,
    "km_proximo" INTEGER,
    "monto" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "proveedor" TEXT NOT NULL DEFAULT '',
    "notas" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehiculo_mantenimientos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vehiculos_placa_key" ON "vehiculos"("placa");

-- CreateIndex
CREATE INDEX "vehiculo_mantenimientos_vehiculo_id_fecha_realizado_idx" ON "vehiculo_mantenimientos"("vehiculo_id", "fecha_realizado");

-- AddForeignKey
ALTER TABLE "vehiculo_mantenimientos" ADD CONSTRAINT "vehiculo_mantenimientos_vehiculo_id_fkey" FOREIGN KEY ("vehiculo_id") REFERENCES "vehiculos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
