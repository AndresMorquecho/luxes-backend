import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../config/prismaClient.js';
import { ProformasController } from '../../features/proformas/infrastructure/adapters/http/proformasController.js';
// No database connection: every persistence operation used below is mocked.
function setup(t, paid = [60]) {
    let writes = 0;
    const state = { id: 'PRO-TEST', estado: 'Aprobada', iva: 0, descuento: 0,
        items: [{ cantidad: 1, precioUnitario: 102.05, valor: 60.00539999999999 },
            { cantidad: 1, precioUnitario: 101.52, valor: 169.99524 }],
        abonos: paid.map((monto, i) => ({ id: `ab-${i}`, monto, fecha: new Date(2026, 8, i + 1) })),
    };
    const originalFind = prisma.proforma.findUnique;
    prisma.proforma.findUnique = (async () => state);
    t.after(() => { prisma.proforma.findUnique = originalFind; });
    const originalTransaction = prisma.$transaction;
    t.after(() => { prisma.$transaction = originalTransaction; });
    prisma.$transaction = (async (fn) => fn({
        abonoProforma: {
            create: async ({ data }) => { writes++; state.abonos.push({ ...data, id: 'new', fecha: new Date() }); },
            update: async ({ where, data }) => { writes++; Object.assign(state.abonos.find((a) => a.id === where.id), data); },
            delete: async ({ where }) => { writes++; state.abonos = state.abonos.filter((a) => a.id !== where.id); },
        },
        proforma: { update: async ({ data }) => { Object.assign(state, data); return state; } },
    }));
    const response = { statusCode: 0, body: null,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; } };
    const request = (monto) => ({ params: { id: state.id, abonoId: `ab-${paid.length - 1}` }, body: { monto, metodoPagoId: 'test-account' }, user: { rol: 'ADMIN' } });
    return { state, response, request, controller: new ProformasController(), writes: () => writes };
}
test('registering $170 against PRO-009 amounts settles $230 without an overpayment error', async (t) => {
    const f = setup(t);
    await f.controller.registrarAbono(f.request(170), f.response);
    assert.equal(f.response.statusCode, 200);
    assert.equal(f.response.body.data.total, 230);
    assert.equal(f.response.body.data.saldoPendiente, 0);
    assert.equal(f.response.body.data.estado, 'Pagada');
    assert.equal(f.writes(), 1);
});
for (const amount of [170.01, 171, 0, -1, 'invalid', Infinity]) {
    test(`invalid or excess payment ${amount} never writes`, async (t) => {
        const f = setup(t);
        await f.controller.registrarAbono(f.request(amount), f.response);
        assert.equal(f.response.statusCode, 400);
        assert.equal(f.writes(), 0);
    });
}
test('a settled proforma rejects additional money', async (t) => {
    const f = setup(t, [60, 170]);
    await f.controller.registrarAbono(f.request(1), f.response);
    assert.equal(f.response.statusCode, 400);
    assert.equal(f.writes(), 0);
});
test('editing last payment excludes itself and uses the area quote total', async (t) => {
    const f = setup(t, [60, 100]);
    await f.controller.editarAbono(f.request(170), f.response);
    assert.equal(f.response.statusCode, 200);
    assert.equal(f.response.body.data.estado, 'Pagada');
    assert.equal(f.response.body.data.saldoPendiente, 0);
});
test('deleting last payment restores the remaining quote balance', async (t) => {
    const f = setup(t, [60, 170]);
    await f.controller.eliminarAbono(f.request(0), f.response);
    assert.equal(f.response.statusCode, 200);
    assert.equal(f.response.body.data.estado, 'Aprobada');
    assert.equal(f.response.body.data.saldoPendiente, 170);
});
test('one cent remaining does not mark the quote fully paid', async (t) => {
    const f = setup(t);
    await f.controller.registrarAbono(f.request(169.99), f.response);
    assert.equal(f.response.statusCode, 200);
    assert.equal(f.response.body.data.estado, 'Aprobada');
    assert.equal(f.response.body.data.saldoPendiente, 0.01);
});
