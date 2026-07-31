import type { Request, Response } from 'express';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';

const THUMB_ROOT = path.resolve('uploads/.thumbs');
const THUMB_WIDTH = 320;

function resolveUploadsAbsolute(relPath: string): string | null {
  if (!relPath.startsWith('/uploads/')) return null;
  const uploadsRoot = path.resolve('uploads');
  const cleanRel = relPath.replace(/^\/uploads\/?/, '');
  const absolutePath = path.join(uploadsRoot, cleanRel);
  const relative = path.relative(uploadsRoot, absolutePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return absolutePath;
}

// Cache en memoria: si sharp falló, no volvemos a intentarlo (caro)
let sharpAvailable: boolean | null = null;

async function checkSharpAvailable(): Promise<boolean> {
  if (sharpAvailable !== null) return sharpAvailable;
  try {
    await import('sharp');
    sharpAvailable = true;
  } catch {
    sharpAvailable = false;
    console.warn('[mediaThumbnailController] sharp no disponible, usando jimp como fallback');
  }
  return sharpAvailable;
}

async function generateThumbWithSharp(absolutePath: string, thumbPath: string): Promise<void> {
  // @ts-ignore
  const sharp: any = (await import('sharp')).default;
  await sharp(absolutePath)
    .rotate()
    .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
    .webp({ quality: 72 })
    .toFile(thumbPath);
}

async function generateThumbWithJimp(absolutePath: string, thumbPath: string): Promise<void> {
  // @ts-ignore
  const { Jimp } = await import('jimp');
  const image = await Jimp.read(absolutePath);
  const w = image.bitmap.width;
  if (w > THUMB_WIDTH) {
    image.resize({ w: THUMB_WIDTH });
  }
  // jimp puede escribir JPEG directamente; lo guardamos como .jpg en vez de .webp
  const jpgThumbPath = thumbPath.replace('.webp', '.jpg');
  await image.write(jpgThumbPath as any);
}

async function ensureThumbFor(absolutePath: string): Promise<{ thumbPath: string; mime: string }> {
  const stat = await fs.stat(absolutePath);
  const useSharp = await checkSharpAvailable();
  const ext = useSharp ? 'webp' : 'jpg';
  const hash = crypto
    .createHash('sha1')
    .update(`${absolutePath}|${stat.mtimeMs}|${stat.size}|${THUMB_WIDTH}|${ext}`)
    .digest('hex');

  const thumbPath = path.join(THUMB_ROOT, `${hash}-${THUMB_WIDTH}.${ext}`);
  const mime = useSharp ? 'image/webp' : 'image/jpeg';

  try {
    await fs.access(thumbPath);
    return { thumbPath, mime };
  } catch {
    /* generate */
  }

  await fs.mkdir(THUMB_ROOT, { recursive: true });

  if (useSharp) {
    await generateThumbWithSharp(absolutePath, thumbPath);
  } else {
    await generateThumbWithJimp(absolutePath, thumbPath);
  }

  return { thumbPath, mime };
}

/**
 * Sirve miniaturas reales (WebP/JPEG ~320px) con cache en disco.
 * - Prioriza sharp (WebP, calidad óptima)
 * - Fallback a jimp (JPEG, sin binarios nativos)
 * - Si ambos fallan, redirige al original
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
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.status(404).send('Archivo no encontrado');
        return;
      }

      res.setHeader('Cache-Control', 'public, max-age=604800, immutable');

      try {
        const { thumbPath, mime } = await ensureThumbFor(absolutePath);
        res.type(mime);
        res.sendFile(thumbPath);
        return;
      } catch (err) {
        console.warn('[mediaThumbnailController] thumbnail generation failed, serving original:', (err as Error).message);
        // Last resort: serve original with long cache headers
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
