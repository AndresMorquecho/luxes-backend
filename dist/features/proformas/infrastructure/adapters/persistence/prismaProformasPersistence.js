import { prisma } from '../../../../../config/prismaClient.js';
const toDate = (value) => {
    if (!value)
        return null;
    return new Date(`${value}T12:00:00.000Z`);
};
const formatDate = (value) => {
    if (!value)
        return '';
    return value.toISOString().split('T')[0];
};
const mapProforma = (record) => ({
    id: record.id,
    clienteId: record.clienteId ?? '',
    cliente: record.clienteNombre,
    telefono: record.telefono,
    email: record.email,
    fecha: formatDate(record.fecha),
    vencimiento: formatDate(record.vencimiento),
    items: record.items
        .sort((a, b) => a.orden - b.orden)
        .map((item) => ({
        descripcion: item.descripcion,
        cantidad: Number(item.cantidad),
        precioUnitario: Number(item.precioUnitario),
    })),
    iva: Number(record.iva),
    notas: record.notas,
    estado: record.estado,
});
const nextSequentialId = (prefix, ids) => {
    const maxNum = ids.reduce((max, id) => {
        const n = parseInt(id.replace(`${prefix}-`, ''), 10);
        return Number.isFinite(n) && n > max ? n : max;
    }, 0);
    return `${prefix}-${String(maxNum + 1).padStart(3, '0')}`;
};
export class PrismaProformasPersistence {
    async listProformas() {
        const records = await prisma.proforma.findMany({
            include: { items: true },
            orderBy: { id: 'desc' },
        });
        return records.map(mapProforma);
    }
    async saveProforma(input) {
        const fecha = toDate(input.fecha);
        if (!fecha)
            throw new Error('La fecha de emisión es obligatoria');
        const items = (input.items ?? []).filter((item) => item.descripcion?.trim());
        if (items.length === 0)
            throw new Error('Debe incluir al menos un artículo');
        const baseData = {
            clienteId: input.clienteId || null,
            clienteNombre: input.cliente,
            telefono: input.telefono ?? '',
            email: input.email ?? '',
            fecha,
            vencimiento: toDate(input.vencimiento),
            iva: input.iva ?? 0.12,
            notas: input.notas ?? '',
            estado: input.estado ?? 'Pendiente',
        };
        if (input.id) {
            const record = await prisma.$transaction(async (tx) => {
                await tx.proformaItem.deleteMany({ where: { proformaId: input.id } });
                return tx.proforma.update({
                    where: { id: input.id },
                    data: {
                        ...baseData,
                        items: {
                            create: items.map((item, orden) => ({
                                descripcion: item.descripcion,
                                cantidad: item.cantidad,
                                precioUnitario: item.precioUnitario,
                                orden,
                            })),
                        },
                    },
                    include: { items: true },
                });
            });
            return mapProforma(record);
        }
        const ids = (await prisma.proforma.findMany({ select: { id: true } })).map((p) => p.id);
        const id = nextSequentialId('PRO', ids);
        const record = await prisma.proforma.create({
            data: {
                id,
                ...baseData,
                items: {
                    create: items.map((item, orden) => ({
                        descripcion: item.descripcion,
                        cantidad: item.cantidad,
                        precioUnitario: item.precioUnitario,
                        orden,
                    })),
                },
            },
            include: { items: true },
        });
        return mapProforma(record);
    }
    async updateProformaEstado(id, estado) {
        const record = await prisma.proforma.update({
            where: { id },
            data: { estado },
            include: { items: true },
        });
        return mapProforma(record);
    }
    async deleteProforma(id) {
        await prisma.proforma.delete({ where: { id } });
        return id;
    }
}
