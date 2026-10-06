// Keep this contract aligned with the frontend proformaAmounts helper.
const numeric = (value, fallback = 0) => {
    if (value === undefined || value === null || value === '')
        return fallback;
    const parsed = Number(String(value).replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : fallback;
};
export const roundProformaMoney = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
// Preserve quoted line values, including their stored precision. Round the aggregate,
// not each line: historical Alux quotes were accepted using the unrounded line sum.
export function calculateProformaItemValue(item) {
    const quoted = numeric(item.valor);
    if (quoted > 0)
        return quoted;
    const quantity = numeric(item.cantidad, 1);
    const width = numeric(item.ancho), height = numeric(item.alto);
    const area = width > 0 && height > 0 ? quantity * width * height
        : numeric(item.metrajeTotal) > 0 ? numeric(item.metrajeTotal)
            : numeric(item.metraje) > 0 ? quantity * numeric(item.metraje) : quantity;
    return area * numeric(item.precioUnitario);
}
export function calculateProformaAmounts(proforma = {}) {
    const subtotal = roundProformaMoney((proforma.items || []).reduce((sum, item) => sum + calculateProformaItemValue(item), 0));
    const descuento = roundProformaMoney(numeric(proforma.descuento));
    const iva = numeric(proforma.iva);
    const base = Math.max(0, subtotal - descuento);
    const impuesto = roundProformaMoney(base * iva);
    const total = roundProformaMoney(base + impuesto);
    const totalAbonado = roundProformaMoney((proforma.abonos || []).reduce((sum, payment) => sum + numeric(payment.monto), 0));
    return { subtotal, descuento, iva, impuesto, total, totalAbonado,
        saldoPendiente: roundProformaMoney(Math.max(0, total - totalAbonado)),
        excedente: roundProformaMoney(Math.max(0, totalAbonado - total)) };
}
