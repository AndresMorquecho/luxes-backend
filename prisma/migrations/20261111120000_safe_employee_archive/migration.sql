BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE "users" ADD COLUMN "archived_at" TIMESTAMP(3);
ALTER TABLE "empleados" ADD COLUMN "archived_at" TIMESTAMP(3);
ALTER TABLE "empleados" ADD COLUMN "fecha_baja" DATE;

-- Keep historical identities even if an old deployment or maintenance script attempts a hard delete.
CREATE FUNCTION prevent_identity_deletion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'El historial debe conservarse. Use la baja del usuario o empleado.' USING ERRCODE = '23503';
END;
$$;
CREATE TRIGGER users_preserve_history BEFORE DELETE ON "users"
FOR EACH ROW EXECUTE FUNCTION prevent_identity_deletion();
CREATE TRIGGER empleados_preserve_history BEFORE DELETE ON "empleados"
FOR EACH ROW EXECUTE FUNCTION prevent_identity_deletion();
COMMIT;
