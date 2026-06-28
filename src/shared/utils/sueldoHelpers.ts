/** Días laborables de referencia para convertir sueldo mensual ↔ diario. */
export const DIAS_SUELDO_MES = 30;

const roundMoney = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function sueldoDiarioFromMensual(sueldoMensual: number): number {
  const mensual = Number(sueldoMensual) || 0;
  if (mensual <= 0) return 0;
  return roundMoney(mensual / DIAS_SUELDO_MES);
}

export function sueldoMensualFromDiario(sueldoDiario: number): number {
  const diario = Number(sueldoDiario) || 0;
  if (diario <= 0) return 0;
  return roundMoney(diario * DIAS_SUELDO_MES);
}

/** Mensual efectivo (corrige montos mensuales guardados en sueldo_diario, ej. 500). */
export function sueldoMensualEfectivo(sueldoDiarioAlmacenado: number): number {
  const stored = Number(sueldoDiarioAlmacenado) || 0;
  if (stored <= 0) return 0;
  if (stored >= 100) return roundMoney(stored);
  return sueldoMensualFromDiario(stored);
}

/** Diario efectivo para referencia (mensual ÷ 30). */
export function sueldoDiarioEfectivo(sueldoDiarioAlmacenado: number): number {
  const stored = Number(sueldoDiarioAlmacenado) || 0;
  if (stored <= 0) return 0;
  if (stored >= 100) return sueldoDiarioFromMensual(stored);
  return roundMoney(stored);
}

/** Mitad del sueldo mensual = base de cada quincena. */
export function sueldoQuincenaBase(sueldoAlmacenado: number): number {
  const mensual = sueldoMensualEfectivo(sueldoAlmacenado);
  return mensual > 0 ? roundMoney(mensual / 2) : 0;
}

/** Tarifa diaria dentro de la quincena: (mensual ÷ 2) ÷ días laborables del período. */
export function sueldoDiarioEnQuincena(sueldoAlmacenado: number, diasLaborables: number): number {
  const base = sueldoQuincenaBase(sueldoAlmacenado);
  if (base <= 0 || diasLaborables <= 0) return 0;
  return roundMoney(base / diasLaborables);
}

/**
 * Sueldo bruto de la quincena: mitad del mes prorrateada por días trabajados.
 * Ej. $500/mes, quincena completa → $250.
 */
export function calcSueldoBrutoQuincena(
  sueldoAlmacenado: number,
  diasLaborados: number,
  diasLaborables: number,
): number {
  const base = sueldoQuincenaBase(sueldoAlmacenado);
  if (base <= 0 || diasLaborables <= 0) return 0;
  const ratio = Math.min(1, Math.max(0, Number(diasLaborados) / Number(diasLaborables)));
  return roundMoney(base * ratio);
}
