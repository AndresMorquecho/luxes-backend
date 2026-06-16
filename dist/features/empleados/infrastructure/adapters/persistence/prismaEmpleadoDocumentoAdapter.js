import fs from 'fs/promises';
import path from 'path';
import { prisma } from '../../../../../config/prismaClient.js';
import { EmpleadoDocumento, EMPLEADO_DOCUMENTO_TIPOS, } from '../../../domain/entities/EmpleadoDocumento.js';
const UPLOADS_ROOT = path.resolve('uploads/empleados');
const mapRecord = (record) => new EmpleadoDocumento({
    id: record.id,
    empleadoId: record.empleadoId,
    tipo: record.tipo,
    nombre: record.nombre,
    archivoUrl: record.archivoUrl,
    mimeType: record.mimeType,
    tamano: record.tamano,
    createdAt: record.createdAt.toISOString(),
});
export const ensureEmpleadoUploadsDir = async (empleadoId) => {
    await fs.mkdir(path.join(UPLOADS_ROOT, empleadoId), { recursive: true });
};
export const isValidDocumentoTipo = (tipo) => EMPLEADO_DOCUMENTO_TIPOS.includes(tipo);
export class PrismaEmpleadoDocumentoAdapter {
    async listByEmpleado(empleadoId) {
        const records = await prisma.empleadoDocumento.findMany({
            where: { empleadoId },
            orderBy: [{ tipo: 'asc' }, { createdAt: 'desc' }],
        });
        return records.map(mapRecord);
    }
    async create(input) {
        if (input.tipo !== 'otro') {
            const existing = await prisma.empleadoDocumento.findFirst({
                where: { empleadoId: input.empleadoId, tipo: input.tipo },
            });
            if (existing) {
                await this.deleteFile(existing.archivoUrl);
                await prisma.empleadoDocumento.delete({ where: { id: existing.id } });
            }
        }
        const record = await prisma.empleadoDocumento.create({
            data: input,
        });
        return mapRecord(record);
    }
    async delete(empleadoId, documentoId) {
        const record = await prisma.empleadoDocumento.findFirst({
            where: { id: documentoId, empleadoId },
        });
        if (!record) {
            throw new Error('Documento no encontrado');
        }
        await this.deleteFile(record.archivoUrl);
        await prisma.empleadoDocumento.delete({ where: { id: documentoId } });
    }
    async deleteAllForEmpleado(empleadoId) {
        const records = await prisma.empleadoDocumento.findMany({ where: { empleadoId } });
        for (const record of records) {
            await this.deleteFile(record.archivoUrl);
        }
        await prisma.empleadoDocumento.deleteMany({ where: { empleadoId } });
        await fs.rm(path.join(UPLOADS_ROOT, empleadoId), { recursive: true, force: true });
    }
    async deleteFile(archivoUrl) {
        if (!archivoUrl.startsWith('/uploads/'))
            return;
        const filePath = path.resolve(`.${archivoUrl}`);
        await fs.unlink(filePath).catch(() => undefined);
    }
}
export { UPLOADS_ROOT as EMPLEADO_UPLOADS_ROOT };
