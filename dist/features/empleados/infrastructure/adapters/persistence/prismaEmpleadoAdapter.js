import { Empleado } from '../../../domain/entities/Empleado.js';
import { EmpleadoRepositoryPort } from '../../../domain/ports/EmpleadoRepositoryPort.js';
import { prisma } from '../../../../../config/prismaClient.js';
const mapRecord = (record) => new Empleado({
    id: record.id,
    nombre: record.nombre,
    cedula: record.cedula,
    telefono: record.telefono,
    correo: record.correo,
    cuentaBanco: record.cuentaBanco,
    banco: record.banco,
    tipoContrato: record.tipoContrato,
    tieneContrato: record.tieneContrato,
    region: record.region ?? 'costa',
    decimoTerceroMensualizado: record.decimoTerceroMensualizado ?? false,
    decimoCuartoMensualizado: record.decimoCuartoMensualizado ?? false,
    sueldoDiario: Number(record.sueldoDiario),
    decimoTerceroValor: record.decimoTerceroValor !== null && record.decimoTerceroValor !== undefined ? Number(record.decimoTerceroValor) : null,
    decimoCuartoValor: record.decimoCuartoValor !== null && record.decimoCuartoValor !== undefined ? Number(record.decimoCuartoValor) : null,
    iessValor: record.iessValor !== null && record.iessValor !== undefined ? Number(record.iessValor) : null,
    direccion: record.direccion,
    foto: record.foto,
    rol: record.user?.rol,
});
const toDbData = (data) => {
    const record = {
        nombre: data.nombre,
        cedula: data.cedula,
        telefono: data.telefono ?? '',
        correo: data.correo ?? '',
        cuentaBanco: data.cuentaBanco ?? '',
        banco: data.banco ?? '',
        tipoContrato: data.tipoContrato ?? 'Fijo',
        tieneContrato: data.tieneContrato ?? true,
        region: data.region ?? 'costa',
        decimoTerceroMensualizado: data.decimoTerceroMensualizado ?? false,
        decimoCuartoMensualizado: data.decimoCuartoMensualizado ?? false,
        sueldoDiario: data.sueldoDiario ?? 0,
        decimoTerceroValor: data.decimoTerceroValor !== undefined ? data.decimoTerceroValor : null,
        decimoCuartoValor: data.decimoCuartoValor !== undefined ? data.decimoCuartoValor : null,
        iessValor: data.iessValor !== undefined ? data.iessValor : null,
        direccion: data.direccion ?? '',
        foto: data.foto || null,
    };
    if (data.passwordHash) {
        record.passwordHash = data.passwordHash;
    }
    return record;
};
export class PrismaEmpleadoAdapter extends EmpleadoRepositoryPort {
    async findAll() {
        const records = await prisma.empleado.findMany({
            include: { user: { select: { rol: true } } },
            orderBy: { id: 'asc' },
        });
        return records.map(mapRecord);
    }
    async findById(id) {
        const record = await prisma.empleado.findUnique({
            where: { id },
            include: { user: { select: { rol: true } } }
        });
        return record ? mapRecord(record) : null;
    }
    async findByCedula(cedula) {
        const record = await prisma.empleado.findUnique({
            where: { cedula },
            include: { user: { select: { rol: true } } }
        });
        return record ? mapRecord(record) : null;
    }
    async create(id, data) {
        const record = await prisma.empleado.create({
            data: { id, ...toDbData(data) },
        });
        return mapRecord(record);
    }
    async update(id, data) {
        const record = await prisma.empleado.update({
            where: { id },
            data: toDbData(data),
        });
        return mapRecord(record);
    }
    async delete(id) {
        await prisma.empleado.delete({ where: { id } });
    }
    async generateNextId() {
        const records = await prisma.empleado.findMany({
            select: { id: true },
        });
        const maxNum = records.reduce((max, record) => {
            const match = record.id.match(/^EMP-(\d+)$/);
            if (!match)
                return max;
            const num = parseInt(match[1], 10);
            return num > max ? num : max;
        }, 0);
        return `EMP-${String(maxNum + 1).padStart(3, '0')}`;
    }
}
