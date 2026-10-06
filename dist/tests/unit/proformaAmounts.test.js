import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateProformaAmounts } from '../../shared/utils/proformaAmounts.js';
// Numeric fixture from PRO-009, without customer or account information.
export const quote009 = {
    iva: 0, descuento: 0,
    items: [
        { cantidad: '1', precioUnitario: '102.05', valor: 60.00539999999999, ancho: 0.6, alto: 0.98 },
        { cantidad: '1', precioUnitario: '101.52', valor: 169.99524, ancho: 0.85, alto: 1.97 },
    ],
    abonos: [{ monto: 60 }],
};
test('PRO-009: quoted area values total $230 and leave $170 after $60', () => {
    const result = calculateProformaAmounts(quote009);
    assert.equal(result.total, 230);
    assert.equal(result.saldoPendiente, 170);
    assert.equal(result.impuesto, 0);
    assert.equal(calculateProformaAmounts({ ...quote009, abonos: [{ monto: 60 }, { monto: 170 }] }).saldoPendiente, 0);
});
test('legacy area and unit items use the same calculation when valor is absent', () => {
    assert.equal(calculateProformaAmounts({ ...quote009, items: quote009.items.map(({ valor, ...item }) => item) }).total, 230);
    assert.equal(calculateProformaAmounts({ items: [{ cantidad: 2, precioUnitario: 50 }] }).total, 100);
    assert.equal(calculateProformaAmounts({ items: [{ cantidad: 2, metraje: 3, precioUnitario: 10 }] }).total, 60);
    assert.equal(calculateProformaAmounts({ items: [{ cantidad: 2, metrajeTotal: 7, precioUnitario: 10 }] }).total, 70);
});
test('discount precedes quoted VAT; zero VAT stays zero', () => {
    const quote = { items: [{ cantidad: 1, precioUnitario: 200 }], descuento: 20 };
    assert.equal(calculateProformaAmounts({ ...quote, iva: 0.15 }).total, 207);
    assert.equal(calculateProformaAmounts({ ...quote, iva: 0 }).total, 180);
    assert.equal(calculateProformaAmounts({ ...quote, descuento: 250, iva: 0.15 }).total, 0);
});
test('payment balances are expressed in cents, including remaining one cent and excess', () => {
    const quote = { items: [{ valor: 0.3 }], abonos: [{ monto: 0.1 }, { monto: 0.2 }] };
    assert.equal(calculateProformaAmounts(quote).saldoPendiente, 0);
    assert.equal(calculateProformaAmounts({ ...quote009, abonos: [{ monto: 229.99 }] }).saldoPendiente, 0.01);
    assert.equal(calculateProformaAmounts({ ...quote009, abonos: [{ monto: 240 }] }).excedente, 10);
});
