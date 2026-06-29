import { prisma } from '../../../../../config/prismaClient.js';
const LANDING_IMAGES_KEY = 'landing_images';
export async function getLandingImageOverrides() {
    const setting = await prisma.siteSetting.findUnique({
        where: { key: LANDING_IMAGES_KEY },
    });
    if (!setting?.value || typeof setting.value !== 'object' || Array.isArray(setting.value)) {
        return {};
    }
    return setting.value;
}
export async function setLandingImageOverride(section, itemId, imageUrl) {
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
export async function removeLandingImageOverride(section, itemId) {
    const current = await getLandingImageOverrides();
    const sectionOverrides = { ...(current[section] ?? {}) };
    delete sectionOverrides[itemId];
    const next = { ...current };
    if (Object.keys(sectionOverrides).length === 0) {
        delete next[section];
    }
    else {
        next[section] = sectionOverrides;
    }
    await prisma.siteSetting.upsert({
        where: { key: LANDING_IMAGES_KEY },
        create: { key: LANDING_IMAGES_KEY, value: next },
        update: { value: next },
    });
    return next;
}
