import path from 'path';
import fs from 'fs/promises';
/**
 * Servidor de miniaturas para imágenes del sistema.
 * Sirve archivos estáticos con cabeceras de caché inmutables para 0 consumo de GPU/CPU.
 */
export async function serveMediaThumbnail(req, res) {
    try {
        const rawUrl = String(req.query.url || '').trim();
        if (!rawUrl) {
            res.status(400).send('URL requerida');
            return;
        }
        if (rawUrl.startsWith('data:') || rawUrl.startsWith('blob:')) {
            res.status(400).send('Data URI no soportado para miniaturas');
            return;
        }
        let relPath = rawUrl;
        if (relPath.startsWith('/api/proyectos/') && relPath.includes('/archivos/')) {
            const match = relPath.match(/^\/api\/proyectos\/([^/]+)\/archivos\/([^/?#]+)/);
            if (match) {
                relPath = `/uploads/proyectos/${match[1]}/${decodeURIComponent(match[2])}`;
            }
        }
        if (relPath.startsWith('/uploads/')) {
            const absolutePath = path.resolve('.' + relPath);
            try {
                await fs.access(absolutePath);
                res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
                res.sendFile(absolutePath);
                return;
            }
            catch {
                res.status(404).send('Archivo no encontrado');
                return;
            }
        }
        if (relPath.startsWith('http://') || relPath.startsWith('https://')) {
            res.redirect(relPath);
            return;
        }
        res.status(404).send('Ruta de archivo no válida');
    }
    catch (error) {
        console.error('[mediaThumbnailController]', error);
        res.status(500).send('Error al procesar miniatura');
    }
}
