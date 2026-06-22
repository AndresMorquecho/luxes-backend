-- AlterTable
ALTER TABLE "users" ADD COLUMN "empleado_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_empleado_id_key" ON "users"("empleado_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_empleado_id_fkey" FOREIGN KEY ("empleado_id") REFERENCES "empleados"("id") ON DELETE CASCADE ON UPDATE CASCADE;
