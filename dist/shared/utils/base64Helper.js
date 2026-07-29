export function parseBase64Image(raw) {
    if (!raw)
        return null;
    const clean = raw.trim();
    if (!clean.startsWith('data:image/'))
        return null;
    const commaIdx = clean.indexOf(',');
    if (commaIdx === -1)
        return null;
    const header = clean.slice(0, commaIdx);
    const base64Data = clean.slice(commaIdx + 1).replace(/[\r\n\s]/g, '');
    const mimeMatch = header.match(/^data:(image\/[a-zA-Z0-9-+.]+)/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
    try {
        const buffer = Buffer.from(base64Data, 'base64');
        if (buffer.length === 0)
            return null;
        return { mimeType, buffer, ext };
    }
    catch {
        return null;
    }
}
