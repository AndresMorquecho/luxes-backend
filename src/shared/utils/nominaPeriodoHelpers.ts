export type FeriadoItem = { fecha: string; descripcion?: string };

export type AsistenciaMarcacion = { fechaHora: Date | string; tipo: string };

const TZ_ECUADOR = 'America/Guayaquil';

export function toDateKey(d: Date | string): string {
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.slice(0, 10))) {
    return d.slice(0, 10);
  }
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('en-CA', { timeZone: TZ_ECUADOR });
}

/** Lunes (1) a sábado (6). Domingo no es día laborable. */
export function isDiaLaboralSemana(dateKey: string): boolean {
  const [y, m, day] = dateKey.split('-').map(Number);
  const dow = new Date(y, m - 1, day).getDay();
  return dow >= 1 && dow <= 6;
}

export function iterDatesInPeriod(fechaInicio: string, fechaFin: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${fechaInicio.slice(0, 10)}T12:00:00`);
  const end = new Date(`${fechaFin.slice(0, 10)}T12:00:00`);
  while (cursor <= end) {
    dates.push(toDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

export function diasEnPeriodo(fechaInicio: string, fechaFin: string): number {
  return iterDatesInPeriod(fechaInicio, fechaFin).length;
}

export function normalizeFeriados(raw: unknown): FeriadoItem[] {
  if (!Array.isArray(raw)) return [];
  const out: FeriadoItem[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const fecha = String((item as FeriadoItem).fecha || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) continue;
    const descripcion = String((item as FeriadoItem).descripcion || '').trim();
    out.push({ fecha, descripcion });
  }
  return out.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

export function feriadosEnPeriodo(
  feriados: FeriadoItem[],
  fechaInicio: string,
  fechaFin: string,
): FeriadoItem[] {
  const ini = fechaInicio.slice(0, 10);
  const fin = fechaFin.slice(0, 10);
  return normalizeFeriados(feriados).filter((f) => f.fecha >= ini && f.fecha <= fin);
}

/** Días laborables del período: lunes a sábado (sin domingos). */
export function calcDiasLaborables(fechaInicio: string, fechaFin: string): number {
  return iterDatesInPeriod(fechaInicio, fechaFin).filter(isDiaLaboralSemana).length;
}

function groupMarcacionesByDay(marcaciones: AsistenciaMarcacion[]): Map<string, AsistenciaMarcacion[]> {
  const map = new Map<string, AsistenciaMarcacion[]>();
  for (const m of marcaciones) {
    const key = toDateKey(m.fechaHora);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(m);
  }
  return map;
}

/** Día pagable: salida registrada, permiso pagado, o marcación legacy completa. */
export function isDiaAsistenciaPagable(marks: AsistenciaMarcacion[]): boolean {
  const tipos = new Set(marks.map((m) => m.tipo));
  return tipos.has('SALIDA') || tipos.has('PERMISO') || tipos.has('MARCACION');
}

export function calcDiasLaborados(
  marcaciones: AsistenciaMarcacion[],
  feriados: FeriadoItem[],
  fechaInicio: string,
  fechaFin: string,
  hasContract: boolean,
): { diasAsistencia: number; diasFeriado: number; diasLaborados: number } {
  const ini = fechaInicio.slice(0, 10);
  const fin = fechaFin.slice(0, 10);
  const byDay = groupMarcacionesByDay(marcaciones);

  let diasAsistencia = 0;
  for (const [dateKey, marks] of byDay) {
    if (dateKey < ini || dateKey > fin) continue;
    if (!isDiaLaboralSemana(dateKey)) continue;
    if (isDiaAsistenciaPagable(marks)) diasAsistencia += 1;
  }

  const feriadosDelPeriodo = feriadosEnPeriodo(feriados, fechaInicio, fechaFin).filter((f) =>
    isDiaLaboralSemana(f.fecha),
  );

  let diasFeriado = 0;
  if (hasContract) {
    for (const f of feriadosDelPeriodo) {
      const marks = byDay.get(f.fecha);
      const yaContado = marks && isDiaAsistenciaPagable(marks);
      if (!yaContado) diasFeriado += 1;
    }
  }

  const diasLaborados = diasAsistencia + diasFeriado;
  return { diasAsistencia, diasFeriado, diasLaborados };
}
