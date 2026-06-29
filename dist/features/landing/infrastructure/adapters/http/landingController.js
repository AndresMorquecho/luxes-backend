import fs from 'fs/promises';
import path from 'path';
import { getLandingImageOverrides, removeLandingImageOverride, setLandingImageOverride, } from '../persistence/prismaLandingAdapter.js';
const VALID_SECTIONS = new Set(['hero', 'services', 'partners', 'catalog']);
const UPLOADS_DIR = path.resolve('uploads/landing');
const ensureUploadsDir = async () => {
    await fs.mkdir(UPLOADS_DIR, { recursive: true });
};
const sanitizeItemId = (itemId) => itemId.replace(/[^a-zA-Z0-9-_]/g, '');
export class LandingController {
    async getConfig(_req, res) {
        try {
            const overrides = await getLandingImageOverrides();
            return res.json({ success: true, data: overrides });
        }
        catch (error) {
            console.error('Error al obtener configuración del landing:', error);
            return res.status(500).json({
                success: false,
                error: { code: 'INTERNAL_ERROR', message: 'No se pudo obtener la configuración del landing' },
            });
        }
    }
    async uploadImage(req, res) {
        try {
            const { section, itemId } = req.body;
            const file = req.file;
            if (!section || !itemId || !VALID_SECTIONS.has(section)) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'INVALID_INPUT', message: 'Sección o identificador de imagen inválido' },
                });
            }
            if (!file) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'NO_FILE', message: 'No se recibió ninguna imagen' },
                });
            }
            const safeItemId = sanitizeItemId(itemId);
            if (!safeItemId) {
                await fs.unlink(file.path).catch(() => undefined);
                return res.status(400).json({
                    success: false,
                    error: { code: 'INVALID_INPUT', message: 'Identificador de imagen inválido' },
                });
            }
            const imageUrl = `/uploads/landing/${file.filename}`;
            const overrides = await setLandingImageOverride(section, safeItemId, imageUrl);
            return res.json({
                success: true,
                data: {
                    section,
                    itemId: safeItemId,
                    imageUrl,
                    overrides,
                },
            });
        }
        catch (error) {
            console.error('Error al subir imagen del landing:', error);
            return res.status(500).json({
                success: false,
                error: { code: 'INTERNAL_ERROR', message: 'No se pudo guardar la imagen' },
            });
        }
    }
    async resetImage(req, res) {
        try {
            const section = String(req.params.section ?? '');
            const itemId = String(req.params.itemId ?? '');
            if (!section || !itemId || !VALID_SECTIONS.has(section)) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'INVALID_INPUT', message: 'Sección o identificador de imagen inválido' },
                });
            }
            const safeItemId = sanitizeItemId(itemId);
            const overrides = await getLandingImageOverrides();
            const currentUrl = overrides[section]?.[safeItemId];
            if (currentUrl?.startsWith('/uploads/landing/')) {
                const filePath = path.resolve(`.${currentUrl}`);
                await fs.unlink(filePath).catch(() => undefined);
            }
            const next = await removeLandingImageOverride(section, safeItemId);
            return res.json({
                success: true,
                data: { section, itemId: safeItemId, overrides: next },
            });
        }
        catch (error) {
            console.error('Error al restaurar imagen del landing:', error);
            return res.status(500).json({
                success: false,
                error: { code: 'INTERNAL_ERROR', message: 'No se pudo restaurar la imagen' },
            });
        }
    }
}
export { ensureUploadsDir, UPLOADS_DIR };
