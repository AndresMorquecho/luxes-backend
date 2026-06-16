-- CreateTable
CREATE TABLE "empleado_documentos" (
    "id" TEXT NOT NULL,
    "empleado_id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "archivo_url" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL DEFAULT '',
    "tamano" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "empleado_documentos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "empleado_documentos_empleado_id_tipo_idx" ON "empleado_documentos"("empleado_id", "tipo");

-- AddForeignKey
ALTER TABLE "empleado_documentos" ADD CONSTRAINT "empleado_documentos_empleado_id_fkey" FOREIGN KEY ("empleado_id") REFERENCES "empleados"("id") ON DELETE CASCADE ON UPDATE CASCADE;
