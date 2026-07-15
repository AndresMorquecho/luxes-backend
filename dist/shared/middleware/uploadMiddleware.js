import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
/**
 * Crea un middleware de Multer para subir archivos a una subcarpeta de uploads/.
 * No aplica restricciones de tipo ni tamaño de archivo.
 */
export function createUploadMiddleware(subfolder) {
    const dest = path.resolve('uploads', subfolder);
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
            const ext = path.extname(file.originalname);
            cb(null, `${uniqueId}${ext}`);
        },
    });
    return multer({ storage });
}
