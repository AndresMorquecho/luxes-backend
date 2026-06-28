export type HorarioDiaConfig = {
  titulo: string;
  entrada: string;
  inicioAlmuerzo: string | null;
  finAlmuerzo: string | null;
  salida: string;
  almuerzoOpcional: boolean;
  nota?: string;
};

export type HorariosLaboralesConfig = {
  semana: HorarioDiaConfig;
  sabado: HorarioDiaConfig;
};

export type TimeSlot = { hour: number; minute: number; label: string };

export type HorarioEsperadoSlots = {
  ENTRADA: TimeSlot | null;
  INICIO_ALMUERZO: TimeSlot | null;
  FIN_ALMUERZO: TimeSlot | null;
  SALIDA: TimeSlot | null;
};

export const DEFAULT_HORARIOS_LABORALES: HorariosLaboralesConfig = {
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
};

const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

export function parseTimeSlot(value: string | null | undefined): TimeSlot | null {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!TIME_RE.test(trimmed)) return null;
  const [h, m] = trimmed.split(':').map(Number);
  return { hour: h, minute: m, label: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` };
}

function normalizeDia(raw: unknown, fallback: HorarioDiaConfig): HorarioDiaConfig {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const almuerzoOpcional = src.almuerzoOpcional === true;
  return {
    titulo: String(src.titulo || fallback.titulo).trim() || fallback.titulo,
    entrada: parseTimeSlot(String(src.entrada || fallback.entrada))?.label || fallback.entrada,
    inicioAlmuerzo: almuerzoOpcional
      ? parseTimeSlot(src.inicioAlmuerzo as string | null)?.label ?? null
      : parseTimeSlot(String(src.inicioAlmuerzo ?? fallback.inicioAlmuerzo))?.label ?? fallback.inicioAlmuerzo,
    finAlmuerzo: almuerzoOpcional
      ? parseTimeSlot(src.finAlmuerzo as string | null)?.label ?? null
      : parseTimeSlot(String(src.finAlmuerzo ?? fallback.finAlmuerzo))?.label ?? fallback.finAlmuerzo,
    salida: parseTimeSlot(String(src.salida || fallback.salida))?.label || fallback.salida,
    almuerzoOpcional,
    nota: src.nota != null ? String(src.nota).trim() : fallback.nota,
  };
}

export function normalizeHorariosLaborales(raw: unknown): HorariosLaboralesConfig {
  if (!raw || typeof raw !== 'object') return DEFAULT_HORARIOS_LABORALES;
  const src = raw as Record<string, unknown>;
  return {
    semana: normalizeDia(src.semana, DEFAULT_HORARIOS_LABORALES.semana),
    sabado: normalizeDia(src.sabado, DEFAULT_HORARIOS_LABORALES.sabado),
  };
}

export function isSabado(dateStr: string): boolean {
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).getDay() === 6;
}

export function getDiaConfig(config: HorariosLaboralesConfig, dateStr: string): HorarioDiaConfig {
  return isSabado(dateStr) ? config.sabado : config.semana;
}

export function buildHorarioEsperadoSlots(dia: HorarioDiaConfig): HorarioEsperadoSlots {
  const useAlmuerzo = !dia.almuerzoOpcional || (dia.inicioAlmuerzo && dia.finAlmuerzo);
  return {
    ENTRADA: parseTimeSlot(dia.entrada),
    INICIO_ALMUERZO: useAlmuerzo ? parseTimeSlot(dia.inicioAlmuerzo) : null,
    FIN_ALMUERZO: useAlmuerzo ? parseTimeSlot(dia.finAlmuerzo) : null,
    SALIDA: parseTimeSlot(dia.salida),
  };
}

export function getHorarioEsperado(config: HorariosLaboralesConfig, dateStr: string): HorarioEsperadoSlots {
  return buildHorarioEsperadoSlots(getDiaConfig(config, dateStr));
}

export function getHorarioLabel(config: HorariosLaboralesConfig, dateStr: string): string {
  const d = getDiaConfig(config, dateStr);
  if (d.almuerzoOpcional || (!d.inicioAlmuerzo && !d.finAlmuerzo)) {
    const base = `${d.titulo} · ${d.entrada} – ${d.salida}`;
    if (d.nota) return `${base} (${d.nota})`;
    if (d.almuerzoOpcional) return `${base} (almuerzo opcional)`;
    return base;
  }
  return `${d.titulo} · ${d.entrada} – ${d.inicioAlmuerzo} · almuerzo ${d.inicioAlmuerzo}–${d.finAlmuerzo} · ${d.finAlmuerzo} – ${d.salida}`;
}
