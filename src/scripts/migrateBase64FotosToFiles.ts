import fs from 'fs/promises';
import path from 'path';
import { prisma } from '../config/prismaClient.js';

export async function migrateBase64FotosToFiles(): Promise<number> {
  try {
    const uploadsDir = path.resolve('uploads', 'fotos');
    await fs.mkdir(uploadsDir, { recursive: true });

    const empleados = await prisma.empleado.findMany({
      where: {
        foto: { startsWith: 'data:image/' },
      },
    });

    if (empleados.length === 0) {
      return 0;
    }

    console.log(`[Migración] Convirtiendo ${empleados.length} fotos Base64 a archivos en disco...`);

    let count = 0;
    for (const emp of empleados) {
      if (!emp.foto) continue;
      const matches = emp.foto.match(/^data:(image\/[a-zA-Z0-9-+.]+);base64,(.+)$/);
      if (!matches) continue;

      const mimeType = matches[1];
      const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
      const buffer = Buffer.from(matches[2], 'base64');
      const filename = `foto-${emp.id}-${Date.now()}.${ext}`;
      const filePath = path.join(uploadsDir, filename);
      const relativeUrl = `/uploads/fotos/${filename}`;

      await fs.writeFile(filePath, buffer);

      await prisma.empleado.update({
        where: { id: emp.id },
        data: { foto: relativeUrl },
      });

      count++;
      console.log(`[Migración] Foto de ${emp.nombre} -> ${relativeUrl} (${Math.round(buffer.length / 1024)} KB)`);
    }

    console.log(`[Migración] Completada exitosamente. ${count} fotos procesadas.`);
    return count;
  } catch (err) {
    console.error('[Migración] Error al convertir fotos Base64:', err);
    return 0;
  }
}
