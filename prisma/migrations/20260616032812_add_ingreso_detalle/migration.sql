-- CreateTable
CREATE TABLE "ingresos_detalles" (
    "id" TEXT NOT NULL,
    "empleado_id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "fecha" DATE NOT NULL,
    "motivo" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ingresos_detalles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ingresos_detalles_empleado_id_fecha_idx" ON "ingresos_detalles"("empleado_id", "fecha");

-- AddForeignKey
ALTER TABLE "ingresos_detalles" ADD CONSTRAINT "ingresos_detalles_empleado_id_fkey" FOREIGN KEY ("empleado_id") REFERENCES "empleados"("id") ON DELETE CASCADE ON UPDATE CASCADE;
