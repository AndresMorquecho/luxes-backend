-- Horarios laborales editables (asistencia / marcaciones)
ALTER TABLE "configuracion" ADD COLUMN IF NOT EXISTS "horarios_laborales" JSONB;
