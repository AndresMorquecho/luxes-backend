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

/** Diario efectivo: corrige montos mensuales guardados por error en sueldo_diario. */
export function sueldoDiarioEfectivo(sueldoDiarioAlmacenado: number): number {
  const stored = Number(sueldoDiarioAlmacenado) || 0;
  if (stored <= 0) return 0;
  if (stored >= 100) return sueldoDiarioFromMensual(stored);
  return roundMoney(stored);
}
