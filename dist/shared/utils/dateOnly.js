/** Parsea YYYY-MM-DD sin corrimiento de día por zona horaria. */
export function parseDateOnly(value) {
    if (!value)
        return null;
    const match = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match)
        return new Date(value);
    const [, y, m, d] = match;
    return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), 12, 0, 0));
}
/** Devuelve YYYY-MM-DD en calendario UTC (para fechas guardadas con mediodía UTC). */
export function formatDateOnly(value) {
    if (!value)
        return null;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime()))
        return null;
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}
/**
 * Parsea el inicio de un día en zona horaria de Ecuador (UTC-5).
 * Ej: "2026-08-15" -> 2026-08-15T00:00:00.000-05:00 (05:00:00 UTC).
 */
export function parseEcuadorStartDate(value) {
    if (!value)
        return new Date();
    if (value instanceof Date)
        return value;
    const str = String(value).trim();
    const match = str.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) {
        return new Date(`${match[1]}T00:00:00.000-05:00`);
    }
    return new Date(str);
}
/**
 * Parsea el fin de un día en zona horaria de Ecuador (UTC-5).
 * Ej: "2026-08-15" -> 2026-08-15T23:59:59.999-05:00 (04:59:59.999 UTC del día siguiente).
 */
export function parseEcuadorEndDate(value) {
    if (!value)
        return new Date();
    if (value instanceof Date)
        return value;
    const str = String(value).trim();
    const match = str.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) {
        return new Date(`${match[1]}T23:59:59.999-05:00`);
    }
    return new Date(str);
}
/**
 * Extrae la fecha en calendario de Ecuador (YYYY-MM-DD) para cualquier Date o string.
 * - Si el timestamp es medianoche UTC (00:00:00.000Z), proviene de un selector de fecha calendario y toma la fecha UTC directa.
 * - Si el timestamp tiene hora de transacción real (como las 8:13 p.m. de Ecuador -> 01:13:00 UTC), aplica el desplazamiento UTC-5 (-5h).
 */
export function getEcuadorDateString(d) {
    if (!d)
        return '';
    const date = d instanceof Date ? d : new Date(d);
    if (Number.isNaN(date.getTime()))
        return '';
    const isMidnightUtc = date.getUTCHours() === 0 && date.getUTCMinutes() === 0 && date.getUTCSeconds() === 0 && date.getUTCMilliseconds() === 0;
    if (isMidnightUtc) {
        return date.toISOString().split('T')[0];
    }
    const ec = new Date(date.getTime() - 5 * 3600 * 1000);
    return ec.toISOString().split('T')[0];
}
/**
 * Construye un rango de consulta en Prisma que cubre ampliamente:
 * - Registros en tiempo real de Ecuador (desde 00:00:00-05:00 hasta hasta 23:59:59.999-05:00)
 * - Registros con fecha de calendario guardados con medianoche UTC (desde 00:00:00Z)
 */
export function buildEcuadorQueryRange(desdeStr, hastaStr) {
    const cleanDesde = desdeStr.split('T')[0];
    const gte = new Date(`${cleanDesde}T00:00:00.000Z`);
    const lte = parseEcuadorEndDate(hastaStr);
    return { gte, lte };
}
