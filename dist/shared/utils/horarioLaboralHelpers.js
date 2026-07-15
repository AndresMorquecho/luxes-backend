export const DEFAULT_HORARIOS_LABORALES = {
    semana: {
        titulo: 'Lun–Vie',
        entrada: '08:00',
        inicioAlmuerzo: '13:00',
        finAlmuerzo: '14:00',
        salida: '17:30',
        almuerzoOpcional: false,
    },
    sabado: {
        titulo: 'Sábado',
        entrada: '09:00',
        inicioAlmuerzo: null,
        finAlmuerzo: null,
        salida: '14:00',
        almuerzoOpcional: true,
        nota: 'almuerzo opcional',
    },
    toleranciaMinutos: 8,
    valorHoraExtra: 2.5,
    valorMediaHoraExtra: 1.5,
};
const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;
export function parseTimeSlot(value) {
    if (!value || typeof value !== 'string')
        return null;
    const trimmed = value.trim();
    if (!TIME_RE.test(trimmed))
        return null;
    const [h, m] = trimmed.split(':').map(Number);
    return { hour: h, minute: m, label: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` };
}
function normalizeDia(raw, fallback) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const almuerzoOpcional = src.almuerzoOpcional === true;
    return {
        titulo: String(src.titulo || fallback.titulo).trim() || fallback.titulo,
        entrada: parseTimeSlot(String(src.entrada || fallback.entrada))?.label || fallback.entrada,
        inicioAlmuerzo: almuerzoOpcional
            ? parseTimeSlot(src.inicioAlmuerzo)?.label ?? null
            : parseTimeSlot(String(src.inicioAlmuerzo ?? fallback.inicioAlmuerzo))?.label ?? fallback.inicioAlmuerzo,
        finAlmuerzo: almuerzoOpcional
            ? parseTimeSlot(src.finAlmuerzo)?.label ?? null
            : parseTimeSlot(String(src.finAlmuerzo ?? fallback.finAlmuerzo))?.label ?? fallback.finAlmuerzo,
        salida: parseTimeSlot(String(src.salida || fallback.salida))?.label || fallback.salida,
        almuerzoOpcional,
        nota: src.nota != null ? String(src.nota).trim() : fallback.nota,
    };
}
export function normalizeHorariosLaborales(raw) {
    if (!raw || typeof raw !== 'object')
        return DEFAULT_HORARIOS_LABORALES;
    const src = raw;
    const rawTol = src.toleranciaMinutos;
    const toleranciaMinutos = rawTol !== undefined && rawTol !== null && !Number.isNaN(Number(rawTol))
        ? Math.max(0, Math.round(Number(rawTol)))
        : DEFAULT_HORARIOS_LABORALES.toleranciaMinutos;
    const rawHE = src.valorHoraExtra;
    const valorHoraExtra = rawHE !== undefined && rawHE !== null && !Number.isNaN(Number(rawHE))
        ? Math.max(0, Number(rawHE))
        : DEFAULT_HORARIOS_LABORALES.valorHoraExtra;
    const rawMHE = src.valorMediaHoraExtra;
    const valorMediaHoraExtra = rawMHE !== undefined && rawMHE !== null && !Number.isNaN(Number(rawMHE))
        ? Math.max(0, Number(rawMHE))
        : DEFAULT_HORARIOS_LABORALES.valorMediaHoraExtra;
    return {
        semana: normalizeDia(src.semana, DEFAULT_HORARIOS_LABORALES.semana),
        sabado: normalizeDia(src.sabado, DEFAULT_HORARIOS_LABORALES.sabado),
        toleranciaMinutos,
        valorHoraExtra,
        valorMediaHoraExtra,
    };
}
/**
 * Calcula el valor de multa en dólares según los minutos de atraso y la tolerancia configurada.
 * Aplica tanto para la entrada como para el regreso de almuerzo.
 *
 * Tramos (sobre el tiempo de tolerancia):
 *   0 – tolerancia          → $0.00 (sin multa)
 *   1 – 8 sobre tolerancia  → $2.00
 *   9 – 16 sobre tolerancia → $3.00
 *   ≥ 17 sobre tolerancia   → $4.00
 */
export function calcularMultaAtraso(minutosAtraso, toleranciaMinutos = DEFAULT_HORARIOS_LABORALES.toleranciaMinutos) {
    if (minutosAtraso <= toleranciaMinutos)
        return 0;
    const sobre = minutosAtraso - toleranciaMinutos;
    if (sobre <= 8)
        return 2.0;
    if (sobre <= 16)
        return 3.0;
    return 4.0;
}
export function isSabado(dateStr) {
    const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d).getDay() === 6;
}
export function getDiaConfig(config, dateStr) {
    return isSabado(dateStr) ? config.sabado : config.semana;
}
export function buildHorarioEsperadoSlots(dia) {
    const useAlmuerzo = !dia.almuerzoOpcional || (dia.inicioAlmuerzo && dia.finAlmuerzo);
    return {
        ENTRADA: parseTimeSlot(dia.entrada),
        INICIO_ALMUERZO: useAlmuerzo ? parseTimeSlot(dia.inicioAlmuerzo) : null,
        FIN_ALMUERZO: useAlmuerzo ? parseTimeSlot(dia.finAlmuerzo) : null,
        SALIDA: parseTimeSlot(dia.salida),
    };
}
export function getHorarioEsperado(config, dateStr) {
    return buildHorarioEsperadoSlots(getDiaConfig(config, dateStr));
}
export function getHorarioLabel(config, dateStr) {
    const d = getDiaConfig(config, dateStr);
    if (d.almuerzoOpcional || (!d.inicioAlmuerzo && !d.finAlmuerzo)) {
        const base = `${d.titulo} · ${d.entrada} – ${d.salida}`;
        if (d.nota)
            return `${base} (${d.nota})`;
        if (d.almuerzoOpcional)
            return `${base} (almuerzo opcional)`;
        return base;
    }
    return `${d.titulo} · ${d.entrada} – ${d.inicioAlmuerzo} · almuerzo ${d.inicioAlmuerzo}–${d.finAlmuerzo} · ${d.finAlmuerzo} – ${d.salida}`;
}
