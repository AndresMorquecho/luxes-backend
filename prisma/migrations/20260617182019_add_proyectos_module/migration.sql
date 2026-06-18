-- CreateTable
CREATE TABLE "proyectos" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "cliente_id" TEXT,
    "cliente_nombre" TEXT NOT NULL DEFAULT '',
    "cliente_empresa" TEXT NOT NULL DEFAULT '',
    "cliente_telefono" TEXT NOT NULL DEFAULT '',
    "cliente_email" TEXT NOT NULL DEFAULT '',
    "cliente_direccion" TEXT NOT NULL DEFAULT '',
    "responsable" TEXT NOT NULL DEFAULT '',
    "requiere_instalacion" BOOLEAN NOT NULL DEFAULT false,
    "fase_actual" TEXT NOT NULL DEFAULT 'COTIZACION',
    "progreso" INTEGER NOT NULL DEFAULT 0,
    "prioridad" TEXT NOT NULL DEFAULT 'MEDIA',
    "estado" TEXT NOT NULL DEFAULT 'ACTIVO',
    "monto_estimado" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_entrega_estimada" TIMESTAMP(3),
    "fecha_completado" TIMESTAMP(3),
    "descripcion" TEXT NOT NULL DEFAULT '',
    "etiquetas" TEXT NOT NULL DEFAULT '',
    "notas" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "proyectos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proyecto_fases" (
    "id" TEXT NOT NULL,
    "proyecto_id" TEXT NOT NULL,
    "fase" TEXT NOT NULL,
    "completada" BOOLEAN NOT NULL DEFAULT false,
    "fecha_completada" TIMESTAMP(3),
    "datos" TEXT NOT NULL DEFAULT '{}',

    CONSTRAINT "proyecto_fases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proyecto_instalaciones" (
    "id" TEXT NOT NULL,
    "proyecto_id" TEXT NOT NULL,
    "fecha_instalacion" TIMESTAMP(3),
    "direccion_instalacion" TEXT NOT NULL DEFAULT '',
    "notas" TEXT NOT NULL DEFAULT '',
    "instalacion_completada" BOOLEAN NOT NULL DEFAULT false,
    "notas_cierre" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "proyecto_instalaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proyecto_instalacion_personal" (
    "id" TEXT NOT NULL,
    "instalacion_id" TEXT NOT NULL,
    "empleado_id" TEXT NOT NULL,
    "rol" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "proyecto_instalacion_personal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proyecto_instalacion_materiales" (
    "id" TEXT NOT NULL,
    "instalacion_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "cantidad" DECIMAL(12,2) NOT NULL,
    "unidad" TEXT NOT NULL DEFAULT '',
    "observacion" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "proyecto_instalacion_materiales_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "proyecto_fases_proyecto_id_fase_key" ON "proyecto_fases"("proyecto_id", "fase");

-- CreateIndex
CREATE UNIQUE INDEX "proyecto_instalaciones_proyecto_id_key" ON "proyecto_instalaciones"("proyecto_id");

-- AddForeignKey
ALTER TABLE "proyectos" ADD CONSTRAINT "proyectos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proyecto_fases" ADD CONSTRAINT "proyecto_fases_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proyecto_instalaciones" ADD CONSTRAINT "proyecto_instalaciones_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proyecto_instalacion_personal" ADD CONSTRAINT "proyecto_instalacion_personal_instalacion_id_fkey" FOREIGN KEY ("instalacion_id") REFERENCES "proyecto_instalaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proyecto_instalacion_personal" ADD CONSTRAINT "proyecto_instalacion_personal_empleado_id_fkey" FOREIGN KEY ("empleado_id") REFERENCES "empleados"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proyecto_instalacion_materiales" ADD CONSTRAINT "proyecto_instalacion_materiales_instalacion_id_fkey" FOREIGN KEY ("instalacion_id") REFERENCES "proyecto_instalaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;
