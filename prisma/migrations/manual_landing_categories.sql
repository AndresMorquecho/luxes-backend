-- Script de migración: Tablas para Landing Page configurable
-- Ejecutar desde la carpeta luxes-backend con:
--   npx prisma migrate dev --name add_landing_categories

-- Tabla de categorías del catálogo
CREATE TABLE IF NOT EXISTS landing_categories (
  id          VARCHAR(36)  PRIMARY KEY,
  name        TEXT         NOT NULL,
  slug        TEXT         NOT NULL UNIQUE,
  "order"     INTEGER      NOT NULL DEFAULT 0,
  active      BOOLEAN      NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Tabla de imágenes por categoría (máx 6 por categoría)
CREATE TABLE IF NOT EXISTS landing_category_images (
  id           VARCHAR(36)  PRIMARY KEY,
  category_id  VARCHAR(36)  NOT NULL REFERENCES landing_categories(id) ON DELETE CASCADE,
  image_url    TEXT         NOT NULL,
  title        TEXT         NOT NULL DEFAULT '',
  description  TEXT         NOT NULL DEFAULT '',
  tags         TEXT         NOT NULL DEFAULT '[]',
  "order"      INTEGER      NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_landing_category_images_category_id
  ON landing_category_images(category_id);
