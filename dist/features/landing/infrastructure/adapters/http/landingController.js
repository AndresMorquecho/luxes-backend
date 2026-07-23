import fs from 'fs/promises';
import path from 'path';
import { getLandingImageOverrides, removeLandingImageOverride, setLandingImageOverride, getWhatsappConfig, setWhatsappConfig, getSocialConfig, setSocialConfig, getCategories, getAllCategories, getCategoryById, createCategory, updateCategory, deleteCategory, addCategoryImage, deleteCategoryImage, getCategoryImageById, updateCategoryImage, } from '../persistence/prismaLandingAdapter.js';
const VALID_SECTIONS = new Set(['hero', 'services', 'partners', 'catalog']);
const UPLOADS_DIR = path.resolve('uploads/landing');
const ensureUploadsDir = async () => {
    await fs.mkdir(UPLOADS_DIR, { recursive: true });
};
const sanitizeItemId = (itemId) => itemId.replace(/[^a-zA-Z0-9-_]/g, '');
// ─── Helpers ──────────────────────────────────────────────────────────────────
const parseTagsField = (tags) => {
    try {
        const parsed = JSON.parse(tags);
        return Array.isArray(parsed) ? parsed : [];
    }
    catch {
        return [];
    }
};
const formatCategory = (cat) => ({
    id: cat.id,
    name: cat.name,
    slug: cat.slug,
    order: cat.order,
    active: cat.active,
    createdAt: cat.createdAt,
    updatedAt: cat.updatedAt,
    images: cat.images.map((img) => ({
        id: img.id,
        categoryId: img.categoryId,
        imageUrl: img.imageUrl,
        title: img.title,
        description: img.description,
        tags: parseTagsField(img.tags),
        order: img.order,
        createdAt: img.createdAt,
    })),
});
// ─── Controller ───────────────────────────────────────────────────────────────
export class LandingController {
    // ── GET público consolidado ────────────────────────────────────────────
    async getConfig(_req, res) {
        try {
            const [overrides, whatsapp, social, categories] = await Promise.all([
                getLandingImageOverrides(),
                getWhatsappConfig(),
                getSocialConfig(),
                getCategories(),
            ]);
            return res.json({
                success: true,
                data: {
                    imageOverrides: overrides,
                    whatsapp,
                    social,
                    categories: categories.map(formatCategory),
                },
            });
        }
        catch (error) {
            console.error('Error al obtener configuración del landing:', error);
            return res.status(500).json({
                success: false,
                error: { code: 'INTERNAL_ERROR', message: 'No se pudo obtener la configuración del landing' },
            });
        }
    }
    // ── Imágenes hero/services/partners/catalog ────────────────────────────────
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
                data: { section, itemId: safeItemId, imageUrl, overrides },
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
    // ── WhatsApp Config ────────────────────────────────────────────────────────
    async getWhatsapp(_req, res) {
        try {
            const config = await getWhatsappConfig();
            return res.json({ success: true, data: config });
        }
        catch (error) {
            console.error('Error al obtener config WhatsApp:', error);
            return res.status(500).json({
                success: false,
                error: { code: 'INTERNAL_ERROR', message: 'Error al obtener config de WhatsApp' },
            });
        }
    }
    async updateWhatsapp(req, res) {
        try {
            const { phone, message } = req.body;
            if (phone !== undefined && !/^\d{7,15}$/.test(phone.trim())) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'INVALID_PHONE', message: 'Número de teléfono inválido (solo dígitos, 7-15 caracteres)' },
                });
            }
            const config = await setWhatsappConfig({ phone, message });
            return res.json({ success: true, data: config });
        }
        catch (error) {
            console.error('Error al actualizar config WhatsApp:', error);
            return res.status(500).json({
                success: false,
                error: { code: 'INTERNAL_ERROR', message: 'Error al actualizar config de WhatsApp' },
            });
        }
    }
    // ── Redes Sociales Config ──────────────────────────────────────
    async getSocial(_req, res) {
        try {
            const config = await getSocialConfig();
            return res.json({ success: true, data: config });
        }
        catch (error) {
            console.error('Error al obtener redes sociales:', error);
            return res.status(500).json({
                success: false,
                error: { code: 'INTERNAL_ERROR', message: 'Error al obtener redes sociales' },
            });
        }
    }
    async updateSocial(req, res) {
        try {
            const { facebook, instagram, tiktok } = req.body;
            const config = await setSocialConfig({ facebook, instagram, tiktok });
            return res.json({ success: true, data: config });
        }
        catch (error) {
            console.error('Error al actualizar redes sociales:', error);
            return res.status(500).json({
                success: false,
                error: { code: 'INTERNAL_ERROR', message: 'Error al actualizar redes sociales' },
            });
        }
    }
    // ── CRUD Categorías ────────────────────────────────────────────────────────
    async listCategories(_req, res) {
        try {
            const categories = await getAllCategories();
            return res.json({ success: true, data: categories.map(formatCategory) });
        }
        catch (error) {
            console.error('Error al listar categorías:', error);
            return res.status(500).json({
                success: false,
                error: { code: 'INTERNAL_ERROR', message: 'Error al obtener categorías' },
            });
        }
    }
    async createCategory(req, res) {
        try {
            const { name, slug, order, active } = req.body;
            if (!name?.trim()) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'INVALID_INPUT', message: 'El nombre es requerido' },
                });
            }
            const autoSlug = slug?.trim() || name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
            const category = await createCategory({ name: name.trim(), slug: autoSlug, order, active });
            return res.status(201).json({ success: true, data: formatCategory(category) });
        }
        catch (error) {
            if (error.code === 'P2002') {
                return res.status(400).json({
                    success: false,
                    error: { code: 'DUPLICATE_SLUG', message: 'Ya existe una categoría con ese slug' },
                });
            }
            console.error('Error al crear categoría:', error);
            return res.status(500).json({
                success: false,
                error: { code: 'INTERNAL_ERROR', message: 'Error al crear categoría' },
            });
        }
    }
    async updateCategory(req, res) {
        try {
            const id = String(req.params.id);
            const { name, slug, order, active } = req.body;
            const existing = await getCategoryById(id);
            if (!existing) {
                return res.status(404).json({
                    success: false,
                    error: { code: 'NOT_FOUND', message: 'Categoría no encontrada' },
                });
            }
            const category = await updateCategory(id, { name, slug, order, active });
            return res.json({ success: true, data: formatCategory(category) });
        }
        catch (error) {
            if (error.code === 'P2002') {
                return res.status(400).json({
                    success: false,
                    error: { code: 'DUPLICATE_SLUG', message: 'Ya existe una categoría con ese slug' },
                });
            }
            console.error('Error al actualizar categoría:', error);
            return res.status(500).json({
                success: false,
                error: { code: 'INTERNAL_ERROR', message: 'Error al actualizar categoría' },
            });
        }
    }
    async deleteCategory(req, res) {
        try {
            const id = String(req.params.id);
            const existing = await getCategoryById(id);
            if (!existing) {
                return res.status(404).json({
                    success: false,
                    error: { code: 'NOT_FOUND', message: 'Categoría no encontrada' },
                });
            }
            // Borrar archivos de imágenes físicos
            for (const img of existing.images) {
                if (img.imageUrl.startsWith('/uploads/landing/')) {
                    await fs.unlink(path.resolve(`.${img.imageUrl}`)).catch(() => undefined);
                }
            }
            await deleteCategory(id);
            return res.json({ success: true, data: { id } });
        }
        catch (error) {
            console.error('Error al eliminar categoría:', error);
            return res.status(500).json({
                success: false,
                error: { code: 'INTERNAL_ERROR', message: 'Error al eliminar categoría' },
            });
        }
    }
    // ── Imágenes de Categoría ──────────────────────────────────────────────────
    async addCategoryImage(req, res) {
        try {
            const id = String(req.params.id);
            const file = req.file;
            const { title, description, tags } = req.body;
            if (!file) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'NO_FILE', message: 'No se recibió ninguna imagen' },
                });
            }
            const existing = await getCategoryById(id);
            if (!existing) {
                await fs.unlink(file.path).catch(() => undefined);
                return res.status(404).json({
                    success: false,
                    error: { code: 'NOT_FOUND', message: 'Categoría no encontrada' },
                });
            }
            let parsedTags = [];
            if (tags) {
                try {
                    parsedTags = JSON.parse(tags);
                }
                catch {
                    parsedTags = tags.split(',').map((t) => t.trim()).filter(Boolean);
                }
            }
            const imageUrl = `/uploads/landing/${file.filename}`;
            const image = await addCategoryImage(id, {
                imageUrl,
                title,
                description,
                tags: parsedTags,
            });
            return res.status(201).json({ success: true, data: { ...image, tags: parsedTags } });
        }
        catch (error) {
            if (error.message === 'MAX_IMAGES_REACHED') {
                if (req.file)
                    await fs.unlink(req.file.path).catch(() => undefined);
                return res.status(400).json({
                    success: false,
                    error: { code: 'MAX_IMAGES_REACHED', message: 'La categoría ya tiene el máximo de 6 imágenes' },
                });
            }
            console.error('Error al agregar imagen a categoría:', error);
            return res.status(500).json({
                success: false,
                error: { code: 'INTERNAL_ERROR', message: 'Error al agregar imagen' },
            });
        }
    }
    async updateCategoryImage(req, res) {
        try {
            const imageId = String(req.params.imageId);
            const { title, description, tags } = req.body;
            const existing = await getCategoryImageById(imageId);
            if (!existing) {
                return res.status(404).json({
                    success: false,
                    error: { code: 'NOT_FOUND', message: 'Imagen no encontrada' },
                });
            }
            let parsedTags;
            if (tags !== undefined) {
                if (Array.isArray(tags)) {
                    parsedTags = tags;
                }
                else {
                    try {
                        parsedTags = JSON.parse(tags);
                    }
                    catch {
                        parsedTags = tags.split(',').map((t) => t.trim()).filter(Boolean);
                    }
                }
            }
            const updated = await updateCategoryImage(imageId, { title, description, tags: parsedTags });
            return res.json({
                success: true,
                data: { ...updated, tags: parseTagsField(updated.tags) },
            });
        }
        catch (error) {
            console.error('Error al actualizar imagen:', error);
            return res.status(500).json({
                success: false,
                error: { code: 'INTERNAL_ERROR', message: 'Error al actualizar imagen' },
            });
        }
    }
    async deleteCategoryImage(req, res) {
        try {
            const imageId = String(req.params.imageId);
            const existing = await getCategoryImageById(imageId);
            if (!existing) {
                return res.status(404).json({
                    success: false,
                    error: { code: 'NOT_FOUND', message: 'Imagen no encontrada' },
                });
            }
            if (existing.imageUrl.startsWith('/uploads/landing/')) {
                await fs.unlink(path.resolve(`.${existing.imageUrl}`)).catch(() => undefined);
            }
            await deleteCategoryImage(imageId);
            return res.json({ success: true, data: { id: imageId } });
        }
        catch (error) {
            console.error('Error al eliminar imagen:', error);
            return res.status(500).json({
                success: false,
                error: { code: 'INTERNAL_ERROR', message: 'Error al eliminar imagen' },
            });
        }
    }
}
export { ensureUploadsDir, UPLOADS_DIR };
