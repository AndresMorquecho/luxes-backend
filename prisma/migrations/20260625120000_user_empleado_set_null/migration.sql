-- Al eliminar un empleado, conservar el usuario del portal (órdenes de compra, tareas, etc.)
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_empleado_id_fkey";

ALTER TABLE "users" ADD CONSTRAINT "users_empleado_id_fkey"
  FOREIGN KEY ("empleado_id") REFERENCES "empleados"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
