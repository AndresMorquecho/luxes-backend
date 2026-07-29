import fs from 'fs/promises';
import path from 'path';
import { prisma } from '../config/prismaClient.js';
import { parseBase64Image } from '../shared/utils/base64Helper.js';
export { parseBase64Image };
export async function migrateBase64FotosToFiles() {
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
            if (!emp.foto)
                continue;
            const parsed = parseBase64Image(emp.foto);
            if (!parsed)
                continue;
            const filename = `foto-${emp.id}-${Date.now()}.${parsed.ext}`;
            const filePath = path.join(uploadsDir, filename);
            const relativeUrl = `/uploads/fotos/${filename}`;
            await fs.writeFile(filePath, parsed.buffer);
            await prisma.empleado.update({
                where: { id: emp.id },
                data: { foto: relativeUrl },
            });
            count++;
            console.log(`[Migración] Foto de ${emp.nombre} -> ${relativeUrl} (${Math.round(parsed.buffer.length / 1024)} KB)`);
        }
        console.log(`[Migración] Completada exitosamente. ${count} fotos procesadas.`);
        return count;
    }
    catch (err) {
        console.error('[Migración] Error al convertir fotos Base64:', err);
        return 0;
    }
}
