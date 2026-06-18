-- CreateTable
CREATE TABLE "egresos" (
    "id" TEXT NOT NULL,
    "empleado_id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "fecha" DATE NOT NULL,
    "motivo" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "egresos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "egresos_empleado_id_fecha_idx" ON "egresos"("empleado_id", "fecha");

-- AddForeignKey
ALTER TABLE "egresos" ADD CONSTRAINT "egresos_empleado_id_fkey" FOREIGN KEY ("empleado_id") REFERENCES "empleados"("id") ON DELETE CASCADE ON UPDATE CASCADE;
