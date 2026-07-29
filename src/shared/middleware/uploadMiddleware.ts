import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { safeResolvePath } from '../utils/pathSafetyHelper.js';

const UPLOADS_BASE = path.resolve('uploads');

/**
 * Crea un middleware de Multer para subir archivos a una subcarpeta de uploads/.
 * Sanitiza la ruta y el nombre del archivo generado.
 */
export function createUploadMiddleware(subfolder: string) {
  const dest = safeResolvePath(UPLOADS_BASE, subfolder);

  // Asegurar que el directorio exista
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, dest);
    },
    filename: (_req, file, cb) => {
      const uniqueId = crypto.randomUUID();
      const rawExt = path.extname(file.originalname).toLowerCase();
      // Sanitizar la extensión para remover caracteres raros
      const cleanExt = rawExt.replace(/[^a-z0-9.]/g, '');
      const ext = cleanExt || '.bin';
      cb(null, `${uniqueId}${ext}`);
    },
  });

  return multer({ storage });
}

