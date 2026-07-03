-- AlterTable
ALTER TABLE "materiales" ADD COLUMN "subtipo" TEXT DEFAULT 'consumible_descargable';
ALTER TABLE "materiales" ADD COLUMN "descarga_stock" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "materiales" ADD COLUMN "es_prestable" BOOLEAN NOT NULL DEFAULT false;

-- Migrate existing data based on tipo and categoria
-- Herramientas → subtipo=herramienta, no descarga stock, sí es prestable
UPDATE "materiales" 
SET subtipo = 'herramienta', 
    descarga_stock = false, 
    es_prestable = true 
WHERE tipo = 'herramienta';

-- Consumibles de Taller → consumible_registro, no descarga stock
UPDATE "materiales" 
SET subtipo = 'consumible_registro', 
    descarga_stock = false, 
    es_prestable = false 
WHERE tipo = 'consumible' AND categoria = 'Taller';

-- Consumibles de Oficina → activo_fijo, no descarga stock
UPDATE "materiales" 
SET subtipo = 'activo_fijo', 
    descarga_stock = false, 
    es_prestable = false 
WHERE tipo = 'consumible' AND categoria = 'Oficina';

-- Consumibles de Impresión que son tintas → consumible_registro, no descarga stock
UPDATE "materiales" 
SET subtipo = 'consumible_registro', 
    descarga_stock = false, 
    es_prestable = false 
WHERE tipo = 'consumible' 
  AND categoria = 'Impresión' 
  AND LOWER(nombre) LIKE '%tinta%';

-- Consumibles de Impresión que NO son tintas (rollos, lonas, etc.) → consumible_descargable, sí descarga stock
UPDATE "materiales" 
SET subtipo = 'consumible_descargable', 
    descarga_stock = true, 
    es_prestable = false 
WHERE tipo = 'consumible' 
  AND categoria = 'Impresión' 
  AND LOWER(nombre) NOT LIKE '%tinta%';
