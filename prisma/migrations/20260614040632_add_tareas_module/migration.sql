-- CreateTable
CREATE TABLE "tareas" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT,
    "prioridad" TEXT NOT NULL DEFAULT 'media',
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "fecha_limite" TIMESTAMP(3),
    "creado_por_id" TEXT NOT NULL,
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_actualizacion" TIMESTAMP(3),

    CONSTRAINT "tareas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tareas_asignaciones" (
    "id" TEXT NOT NULL,
    "tarea_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "tareas_asignaciones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tareas_asignaciones_tarea_id_user_id_key" ON "tareas_asignaciones"("tarea_id", "user_id");

-- AddForeignKey
ALTER TABLE "tareas" ADD CONSTRAINT "tareas_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tareas_asignaciones" ADD CONSTRAINT "tareas_asignaciones_tarea_id_fkey" FOREIGN KEY ("tarea_id") REFERENCES "tareas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tareas_asignaciones" ADD CONSTRAINT "tareas_asignaciones_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
