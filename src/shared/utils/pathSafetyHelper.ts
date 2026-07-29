import path from 'path';
import fs from 'fs/promises';

/**
 * Resuelve una ruta dentro de baseDir garantizando que no haya path traversal y que
 * el destino esté estrictamente dentro de baseDir.
 */
export function safeResolvePath(baseDir: string, ...subPaths: string[]): string {
  const resolvedBase = path.resolve(baseDir);

  for (const part of subPaths) {
    if (typeof part !== 'string' || !part || !part.trim()) {
      throw new Error(`[pathSafetyHelper] Subpath inválido o vacío: "${part}"`);
    }
    const cleanPart = part.trim();
    if (cleanPart === '.' || cleanPart === '..' || cleanPart.includes('../') || cleanPart.includes('..\\')) {
      throw new Error(`[pathSafetyHelper] Path traversal detectado en subpath: "${part}"`);
    }
  }

  const resolvedTarget = path.resolve(resolvedBase, ...subPaths);
  const relative = path.relative(resolvedBase, resolvedTarget);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`[pathSafetyHelper] La ruta resuelta "${resolvedTarget}" escapa del directorio base "${resolvedBase}"`);
  }

  return resolvedTarget;
}

/**
 * Elimina de manera segura un subdirectorio perteneciente a baseDir.
 * Garantiza que NUNCA se elimine el propio baseDir ni carpetas fuera de baseDir.
 */
export async function safeRemoveDir(baseDir: string, targetSubDir: string): Promise<void> {
  if (!targetSubDir || typeof targetSubDir !== 'string' || !targetSubDir.trim()) {
    throw new Error(`[pathSafetyHelper] targetSubDir es requerido y no puede estar vacío.`);
  }

  const cleanSubDir = targetSubDir.trim();
  if (cleanSubDir === '.' || cleanSubDir === '..' || cleanSubDir === '/' || cleanSubDir === '\\') {
    throw new Error(`[pathSafetyHelper] Operación de borrado denegada para subdirectorio relativo reservado: "${cleanSubDir}"`);
  }

  const resolvedBase = path.resolve(baseDir);
  const targetPath = safeResolvePath(resolvedBase, cleanSubDir);

  const relative = path.relative(resolvedBase, targetPath);

  // SIEMPRE asegurar que targetPath es un subdirectorio directo/descendiente y NO el directorio base
  if (!relative || relative === '.' || relative === '') {
    throw new Error(`[pathSafetyHelper] CRÍTICO: Se intentó eliminar el directorio base "${resolvedBase}". Operación abortada.`);
  }

  try {
    const stat = await fs.stat(targetPath);
    if (stat.isDirectory()) {
      await fs.rm(targetPath, { recursive: true, force: true });
    }
  } catch (err: any) {
    if (err?.code !== 'ENOENT') {
      console.error(`[pathSafetyHelper] Error borrando directorio "${targetPath}":`, err);
    }
  }
}

/**
 * Elimina un archivo individual si reside dentro de baseDir (o si la URL relativa pertenece a baseDir).
 */
export async function safeUnlinkFile(baseDir: string, fileRelativeOrUrlPath: string): Promise<void> {
  if (!fileRelativeOrUrlPath || typeof fileRelativeOrUrlPath !== 'string') return;

  const resolvedBase = path.resolve(baseDir);

  // Normalizar URLs que inician con / (ej: /uploads/landing/foto.jpg -> uploads/landing/foto.jpg)
  let cleanPath = fileRelativeOrUrlPath.trim();
  if (cleanPath.startsWith('/')) {
    cleanPath = `.${cleanPath}`;
  }

  try {
    const targetPath = path.resolve(cleanPath);
    const relative = path.relative(resolvedBase, targetPath);

    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      console.warn(`[pathSafetyHelper] Intento de eliminar archivo fuera de baseDir: "${cleanPath}"`);
      return;
    }

    const stat = await fs.stat(targetPath);
    if (stat.isFile()) {
      await fs.unlink(targetPath);
    }
  } catch (err: any) {
    if (err?.code !== 'ENOENT') {
      console.error(`[pathSafetyHelper] Error desenlazando archivo "${fileRelativeOrUrlPath}":`, err);
    }
  }
}
