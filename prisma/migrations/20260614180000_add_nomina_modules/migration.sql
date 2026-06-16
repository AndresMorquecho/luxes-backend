-- CreateTable
CREATE TABLE "asistencias" (
    "id" TEXT NOT NULL,
    "empleado_id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "fecha_hora" TIMESTAMP(3) NOT NULL,
    "ubicacion_lat" DOUBLE PRECISION,
    "ubicacion_lng" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asistencias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vacaciones" (
    "id" TEXT NOT NULL,
    "empleado_id" TEXT NOT NULL,
    "anio" INTEGER NOT NULL,
    "dias_tomados" JSONB NOT NULL DEFAULT '[]',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vacaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "horas_extras" (
    "id" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "colaborador_id" TEXT NOT NULL,
    "horas" DECIMAL(8,2) NOT NULL,
    "detalle_horario" TEXT NOT NULL DEFAULT '',
    "descripcion" TEXT NOT NULL DEFAULT '',
    "valor_por_hora" DECIMAL(10,2) NOT NULL DEFAULT 2.5,
    "total" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "horas_extras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nomina_registros" (
    "id" TEXT NOT NULL,
    "empleado_id" TEXT NOT NULL,
    "fecha_inicio" DATE NOT NULL,
    "fecha_fin" DATE NOT NULL,
    "dias_laborables" INTEGER NOT NULL DEFAULT 30,
    "dias_laborados" INTEGER NOT NULL DEFAULT 30,
    "permiso_horas" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "ingresos" JSONB NOT NULL DEFAULT '{}',
    "egresos" JSONB NOT NULL DEFAULT '{}',
    "abonos" JSONB NOT NULL DEFAULT '[]',
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nomina_registros_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "asistencias_empleado_id_fecha_hora_idx" ON "asistencias"("empleado_id", "fecha_hora");

-- CreateIndex
CREATE UNIQUE INDEX "vacaciones_empleado_id_anio_key" ON "vacaciones"("empleado_id", "anio");

-- CreateIndex
CREATE INDEX "horas_extras_colaborador_id_fecha_idx" ON "horas_extras"("colaborador_id", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "nomina_registros_empleado_id_fecha_inicio_fecha_fin_key" ON "nomina_registros"("empleado_id", "fecha_inicio", "fecha_fin");

-- AddForeignKey
ALTER TABLE "asistencias" ADD CONSTRAINT "asistencias_empleado_id_fkey" FOREIGN KEY ("empleado_id") REFERENCES "empleados"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vacaciones" ADD CONSTRAINT "vacaciones_empleado_id_fkey" FOREIGN KEY ("empleado_id") REFERENCES "empleados"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "horas_extras" ADD CONSTRAINT "horas_extras_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "empleados"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nomina_registros" ADD CONSTRAINT "nomina_registros_empleado_id_fkey" FOREIGN KEY ("empleado_id") REFERENCES "empleados"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Limpiar datos de prueba de empleados
TRUNCATE TABLE "empleados" CASCADE;
