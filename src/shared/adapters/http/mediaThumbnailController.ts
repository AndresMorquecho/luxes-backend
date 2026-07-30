import type { Request, Response } from 'express';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';

const THUMB_ROOT = path.resolve('uploads/.thumbs');
const THUMB_WIDTH = 320;

function resolveUploadsAbsolute(relPath: string): string | null {
  if (!relPath.startsWith('/uploads/')) return null;
  const absolutePath = path.resolve('.' + relPath);
  const uploadsRoot = path.resolve('uploads');
  const relative = path.relative(uploadsRoot, absolutePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return absolutePath;
}

async function ensureThumbFor(absolutePath: string): Promise<string> {
  const stat = await fs.stat(absolutePath);
  const hash = crypto
    .createHash('sha1')
    .update(`${absolutePath}|${stat.mtimeMs}|${stat.size}|${THUMB_WIDTH}`)
    .digest('hex');
  const thumbPath = path.join(THUMB_ROOT, `${hash}-${THUMB_WIDTH}.webp`);

  try {
    await fs.access(thumbPath);
    return thumbPath;
  } catch {
    /* generate */
  }

  await fs.mkdir(THUMB_ROOT, { recursive: true });

  // Import dinámico — @ts-ignore porque sharp tiene tipos propios al instalarse (npm install)
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sharp: any = (await import('sharp')).default;

  await sharp(absolutePath)
    .rotate()
    .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
    .webp({ quality: 72 })
    .toFile(thumbPath);

  return thumbPath;
}

/**
 * Sirve miniaturas reales (WebP ~320px) con cache en disco.
 * Si sharp falla, hace fallback al original para no romper la UI.
 */
export async function serveMediaThumbnail(req: Request, res: Response): Promise<void> {
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
      const absolutePath = resolveUploadsAbsolute(relPath);
      if (!absolutePath) {
        res.status(403).send('Ruta no permitida');
        return;
      }

      try {
        await fs.access(absolutePath);
      } catch {
        res.status(404).send('Archivo no encontrado');
        return;
      }

      res.setHeader('Cache-Control', 'public, max-age=604800, immutable');

      try {
        const thumbPath = await ensureThumbFor(absolutePath);
        res.type('image/webp');
        res.sendFile(thumbPath);
        return;
      } catch (err) {
        console.warn('[mediaThumbnailController] sharp fallback to original:', err);
        res.sendFile(absolutePath);
        return;
      }
    }

    if (relPath.startsWith('http://') || relPath.startsWith('https://')) {
      res.redirect(relPath);
      return;
    }

    res.status(404).send('Ruta de archivo no válida');
  } catch (error) {
    console.error('[mediaThumbnailController]', error);
    res.status(500).send('Error al procesar miniatura');
  }
}
