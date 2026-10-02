import { getEcuadorDateString } from '../../../shared/utils/dateOnly.js';

export const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
export function balancePeriod(desde: unknown, hasta: unknown) {
  const valid = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0,10) === value;
  if (!valid(desde) || !valid(hasta) || desde > hasta) throw new Error('Indica un período válido con fechas desde y hasta.');
  const next = new Date(`${hasta}T00:00:00Z`); next.setUTCDate(next.getUTCDate()+1);
  return {
    desde, hasta,
    calendar: { gte: new Date(`${desde}T00:00:00Z`), lt: next },
    timestamps: { gte: new Date(`${desde}T00:00:00-05:00`), lt: new Date(next.getTime()+5*3600000) },
    // Historical payments may contain a date picker value at UTC midnight.
    payments: { gte: new Date(`${desde}T00:00:00Z`), lt: new Date(next.getTime()+5*3600000) },
  };
}
export type BalancePeriod = ReturnType<typeof balancePeriod>;
export const paymentInPeriod = (date: Date | string, period: BalancePeriod) => {
  const day = getEcuadorDateString(date); return day >= period.desde && day <= period.hasta;
};
export const paymentMonth = (date: Date | string) => Number(getEcuadorDateString(date).slice(5,7))-1;

type Sale = { estado: string; iva: unknown; items: { cantidad: unknown; precioUnitario: unknown }[]; abonos: { monto: number; fecha: Date | string }[] };
export function saleBalance(sale: Sale, period: BalancePeriod) {
  const paid = roundMoney(sale.abonos.filter(a => getEcuadorDateString(a.fecha) <= period.hasta).reduce((s,a)=>s+Number(a.monto),0));
  const state = sale.estado.toLowerCase();
  const included = !['rechazada','rechazado','cancelada','cancelado','anulada','anulado'].includes(state)
    && (['aprobada','aprobado','pagada','pagado'].includes(state) || paid > 0);
  const total = roundMoney(sale.items.reduce((s,i)=>s+Number(i.cantidad)*Number(i.precioUnitario),0)*(1+Number(sale.iva)));
  return { included, total, paid, pendiente: roundMoney(Math.max(0,total-paid)) };
}

export function summarizeSurveys(phases: { proyectoId: string; datos: string }[], period: BalancePeriod) {
  const responses = new Map<string,{rating:number;date:string}>();
  for (const phase of phases) {
    try {
      const survey = JSON.parse(phase.datos).encuestaSatisfaccion;
      const rating = Number(survey?.calificacionGeneral);
      if (survey?.completada !== true || !Number.isInteger(rating) || rating < 1 || rating > 5) continue;
      const stamp = survey.fechaRespuesta;
      const date = stamp && Number.isFinite(Date.parse(stamp))
        ? new Date(new Date(stamp).getTime()-5*3600000).toISOString().slice(0,10)
        : typeof survey.fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(survey.fecha) ? survey.fecha : '';
      if (!date || date < period.desde || date > period.hasta) continue;
      if (!responses.has(phase.proyectoId) || responses.get(phase.proyectoId)!.date < date) responses.set(phase.proyectoId,{rating,date});
    } catch { /* Malformed/unanswered surveys do not count as ratings. */ }
  }
  const values = [...responses.values()];
  return { totalEncuestas:values.length, satisfechos:values.filter(s=>s.rating>=4).length,
    neutros:values.filter(s=>s.rating===3).length, inconformes:values.filter(s=>s.rating<=2).length };
}
