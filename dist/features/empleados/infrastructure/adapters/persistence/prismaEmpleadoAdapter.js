import { Empleado } from '../../../domain/entities/Empleado.js';
import { EmpleadoRepositoryPort } from '../../../domain/ports/EmpleadoRepositoryPort.js';
import { prisma } from '../../../../../config/prismaClient.js';
const mapRecord = (record) => new Empleado({
    id: record.id,
    nombre: record.nombre,
    cedula: record.cedula,
    cargo: record.cargo,
    departamento: record.departamento,
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
    direccion: record.direccion,
    foto: record.foto,
});
const toDbData = (data) => {
    const record = {
        nombre: data.nombre,
        cedula: data.cedula,
        cargo: data.cargo ?? '',
        departamento: data.departamento ?? '',
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
            orderBy: { id: 'asc' },
        });
        return records.map(mapRecord);
    }
    async findById(id) {
        const record = await prisma.empleado.findUnique({ where: { id } });
        return record ? mapRecord(record) : null;
    }
    async findByCedula(cedula) {
        const record = await prisma.empleado.findUnique({ where: { cedula } });
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
