-- Usuario que registró el movimiento financiero (distinto del vendedor/atiende de la proforma)
ALTER TABLE "abonos_proforma" ADD COLUMN "registrado_por_user_id" TEXT;
ALTER TABLE "gastos" ADD COLUMN "registrado_por_user_id" TEXT;
ALTER TABLE "abonos_compra" ADD COLUMN "registrado_por_user_id" TEXT;

CREATE INDEX "abonos_proforma_registrado_por_user_id_idx" ON "abonos_proforma"("registrado_por_user_id");
CREATE INDEX "gastos_registrado_por_user_id_idx" ON "gastos"("registrado_por_user_id");
CREATE INDEX "abonos_compra_registrado_por_user_id_idx" ON "abonos_compra"("registrado_por_user_id");

ALTER TABLE "abonos_proforma" ADD CONSTRAINT "abonos_proforma_registrado_por_user_id_fkey" FOREIGN KEY ("registrado_por_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_registrado_por_user_id_fkey" FOREIGN KEY ("registrado_por_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "abonos_compra" ADD CONSTRAINT "abonos_compra_registrado_por_user_id_fkey" FOREIGN KEY ("registrado_por_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
