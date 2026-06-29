import { prisma } from '../../../../../config/prismaClient.js';
const mapCliente = (record) => ({
    id: record.id,
    nombre: record.nombre,
    cedulaRuc: record.cedulaRuc,
    telefono: record.telefono,
    email: record.email,
    direccion: record.direccion,
    tipo: record.tipo,
    notas: record.notas,
});
const nextSequentialId = (prefix, ids) => {
    const maxNum = ids.reduce((max, id) => {
        const n = parseInt(id.replace(`${prefix}-`, ''), 10);
        return Number.isFinite(n) && n > max ? n : max;
    }, 0);
    return `${prefix}-${String(maxNum + 1).padStart(3, '0')}`;
};
export class PrismaClientesPersistence {
    async list() {
        const records = await prisma.cliente.findMany({ orderBy: { id: 'asc' } });
        return records.map(mapCliente);
    }
    async save(input) {
        const data = {
            nombre: input.nombre,
            cedulaRuc: input.cedulaRuc ?? '',
            telefono: input.telefono ?? '',
            email: input.email ?? '',
            direccion: input.direccion ?? '',
            tipo: input.tipo ?? 'Persona',
            notas: input.notas ?? '',
        };
        if (input.id) {
            const record = await prisma.cliente.update({
                where: { id: input.id },
                data,
            });
            return mapCliente(record);
        }
        const ids = (await prisma.cliente.findMany({ select: { id: true } })).map((c) => c.id);
        const id = nextSequentialId('CLI', ids);
        const record = await prisma.cliente.create({ data: { id, ...data } });
        return mapCliente(record);
    }
    async remove(id) {
        await prisma.cliente.delete({ where: { id } });
        return id;
    }
}
