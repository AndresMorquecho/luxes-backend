-- Configuración de feriados y días laborables por período de nómina (quincena)
CREATE TABLE "nomina_periodo_config" (
    "id" TEXT NOT NULL,
    "fecha_inicio" DATE NOT NULL,
    "fecha_fin" DATE NOT NULL,
    "feriados" JSONB NOT NULL DEFAULT '[]',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nomina_periodo_config_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "nomina_periodo_config_fecha_inicio_fecha_fin_key"
ON "nomina_periodo_config"("fecha_inicio", "fecha_fin");
