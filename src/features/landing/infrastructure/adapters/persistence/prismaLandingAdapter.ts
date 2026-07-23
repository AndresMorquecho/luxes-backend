import { prisma } from '../../../../../config/prismaClient.js';

// ─── Configuración de imágenes del hero ───────────────────────────────────────

const LANDING_IMAGES_KEY = 'landing_images';

export type LandingImageOverrides = Record<string, Record<string, string>>;

export async function getLandingImageOverrides(): Promise<LandingImageOverrides> {
  const setting = await prisma.siteSetting.findUnique({
    where: { key: LANDING_IMAGES_KEY },
  });

  if (!setting?.value || typeof setting.value !== 'object' || Array.isArray(setting.value)) {
    return {};
  }

  return setting.value as LandingImageOverrides;
}

export async function setLandingImageOverride(
  section: string,
  itemId: string,
  imageUrl: string
): Promise<LandingImageOverrides> {
  const current = await getLandingImageOverrides();
  const sectionOverrides = { ...(current[section] ?? {}), [itemId]: imageUrl };
  const next = { ...current, [section]: sectionOverrides };

  await prisma.siteSetting.upsert({
    where: { key: LANDING_IMAGES_KEY },
    create: { key: LANDING_IMAGES_KEY, value: next },
    update: { value: next },
  });

  return next;
}

export async function removeLandingImageOverride(
  section: string,
  itemId: string
): Promise<LandingImageOverrides> {
  const current = await getLandingImageOverrides();
  const sectionOverrides = { ...(current[section] ?? {}) };
  delete sectionOverrides[itemId];

  const next = { ...current };
  if (Object.keys(sectionOverrides).length === 0) {
    delete next[section];
  } else {
    next[section] = sectionOverrides;
  }

  await prisma.siteSetting.upsert({
    where: { key: LANDING_IMAGES_KEY },
    create: { key: LANDING_IMAGES_KEY, value: next },
    update: { value: next },
  });

  return next;
}

// ─── Configuración de WhatsApp ────────────────────────────────────────────────

const LANDING_WHATSAPP_KEY = 'landing_whatsapp';

export interface WhatsappConfig {
  phone: string;
  message: string;
}

const DEFAULT_WHATSAPP: WhatsappConfig = {
  phone: '593968982380',
  message: 'Hola, me interesa conocer más sobre los servicios de LUXES.',
};

export async function getWhatsappConfig(): Promise<WhatsappConfig> {
  const setting = await prisma.siteSetting.findUnique({
    where: { key: LANDING_WHATSAPP_KEY },
  });

  if (!setting?.value || typeof setting.value !== 'object' || Array.isArray(setting.value)) {
    return DEFAULT_WHATSAPP;
  }

  const val = setting.value as Record<string, unknown>;
  return {
    phone: typeof val.phone === 'string' ? val.phone : DEFAULT_WHATSAPP.phone,
    message: typeof val.message === 'string' ? val.message : DEFAULT_WHATSAPP.message,
  };
}

export async function setWhatsappConfig(config: Partial<WhatsappConfig>): Promise<WhatsappConfig> {
  const current = await getWhatsappConfig();
  const next: WhatsappConfig = {
    phone: config.phone?.trim() || current.phone,
    message: config.message?.trim() || current.message,
  };

  await prisma.siteSetting.upsert({
    where: { key: LANDING_WHATSAPP_KEY },
    create: { key: LANDING_WHATSAPP_KEY, value: next as any },
    update: { value: next as any },
  });

  return next;
}

// ─── Configuración de Redes Sociales ─────────────────────────────────────────

const LANDING_SOCIAL_KEY = 'landing_social';

export interface SocialConfig {
  facebook: string;
  instagram: string;
  tiktok: string;
}

const DEFAULT_SOCIAL: SocialConfig = {
  facebook: 'https://www.facebook.com',
  instagram: 'https://www.instagram.com',
  tiktok: 'https://www.tiktok.com',
};

export async function getSocialConfig(): Promise<SocialConfig> {
  const setting = await prisma.siteSetting.findUnique({
    where: { key: LANDING_SOCIAL_KEY },
  });

  if (!setting?.value || typeof setting.value !== 'object' || Array.isArray(setting.value)) {
    return DEFAULT_SOCIAL;
  }

  const val = setting.value as Record<string, unknown>;
  return {
    facebook: typeof val.facebook === 'string' ? val.facebook : DEFAULT_SOCIAL.facebook,
    instagram: typeof val.instagram === 'string' ? val.instagram : DEFAULT_SOCIAL.instagram,
    tiktok: typeof val.tiktok === 'string' ? val.tiktok : DEFAULT_SOCIAL.tiktok,
  };
}

export async function setSocialConfig(config: Partial<SocialConfig>): Promise<SocialConfig> {
  const current = await getSocialConfig();
  const next: SocialConfig = {
    facebook: config.facebook?.trim() || current.facebook,
    instagram: config.instagram?.trim() || current.instagram,
    tiktok: config.tiktok?.trim() || current.tiktok,
  };

  await prisma.siteSetting.upsert({
    where: { key: LANDING_SOCIAL_KEY },
    create: { key: LANDING_SOCIAL_KEY, value: next as any },
    update: { value: next as any },
  });

  return next;
}



export interface CategoryInput {
  name: string;
  slug: string;
  order?: number;
  active?: boolean;
}

export interface CategoryImageInput {
  imageUrl: string;
  title?: string;
  description?: string;
  tags?: string[];
  order?: number;
}

export async function getCategories() {
  return prisma.landingCategory.findMany({
    where: { active: true },
    orderBy: { order: 'asc' },
    include: {
      images: {
        orderBy: { order: 'asc' },
      },
    },
  });
}

export async function getAllCategories() {
  return prisma.landingCategory.findMany({
    orderBy: { order: 'asc' },
    include: {
      images: {
        orderBy: { order: 'asc' },
      },
    },
  });
}

export async function getCategoryById(id: string) {
  return prisma.landingCategory.findUnique({
    where: { id },
    include: {
      images: { orderBy: { order: 'asc' } },
    },
  });
}

export async function createCategory(data: CategoryInput) {
  const existing = await prisma.landingCategory.count();
  return prisma.landingCategory.create({
    data: {
      name: data.name.trim(),
      slug: data.slug.trim().toLowerCase().replace(/\s+/g, '-'),
      order: data.order ?? existing,
      active: data.active ?? true,
    },
    include: { images: true },
  });
}

export async function updateCategory(id: string, data: Partial<CategoryInput>) {
  return prisma.landingCategory.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name.trim() }),
      ...(data.slug !== undefined && {
        slug: data.slug.trim().toLowerCase().replace(/\s+/g, '-'),
      }),
      ...(data.order !== undefined && { order: data.order }),
      ...(data.active !== undefined && { active: data.active }),
    },
    include: { images: { orderBy: { order: 'asc' } } },
  });
}

export async function deleteCategory(id: string) {
  return prisma.landingCategory.delete({ where: { id } });
}

export async function countCategoryImages(categoryId: string): Promise<number> {
  return prisma.landingCategoryImage.count({ where: { categoryId } });
}

export async function addCategoryImage(categoryId: string, data: CategoryImageInput) {
  const count = await countCategoryImages(categoryId);
  if (count >= 6) {
    throw new Error('MAX_IMAGES_REACHED');
  }
  return prisma.landingCategoryImage.create({
    data: {
      categoryId,
      imageUrl: data.imageUrl,
      title: data.title?.trim() ?? '',
      description: data.description?.trim() ?? '',
      tags: JSON.stringify(data.tags ?? []),
      order: data.order ?? count,
    },
  });
}

export async function updateCategoryImage(
  imageId: string,
  data: Partial<Omit<CategoryImageInput, 'imageUrl'>>
) {
  return prisma.landingCategoryImage.update({
    where: { id: imageId },
    data: {
      ...(data.title !== undefined && { title: data.title.trim() }),
      ...(data.description !== undefined && { description: data.description.trim() }),
      ...(data.tags !== undefined && { tags: JSON.stringify(data.tags) }),
      ...(data.order !== undefined && { order: data.order }),
    },
  });
}

export async function deleteCategoryImage(imageId: string) {
  return prisma.landingCategoryImage.delete({ where: { id: imageId } });
}

export async function getCategoryImageById(imageId: string) {
  return prisma.landingCategoryImage.findUnique({ where: { id: imageId } });
}
