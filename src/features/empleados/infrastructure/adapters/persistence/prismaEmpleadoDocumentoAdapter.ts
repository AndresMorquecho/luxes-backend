import fs from 'fs/promises';
import path from 'path';
import { prisma } from '../../../../../config/prismaClient.js';
import { safeRemoveDir, safeUnlinkFile } from '../../../../../shared/utils/pathSafetyHelper.js';
import {
  EmpleadoDocumento,
  EMPLEADO_DOCUMENTO_TIPOS,
  EmpleadoDocumentoTipo,
} from '../../../domain/entities/EmpleadoDocumento.js';

const UPLOADS_ROOT = path.resolve('uploads/empleados');

const mapRecord = (record: {
  id: string;
  empleadoId: string;
  tipo: string;
  nombre: string;
  archivoUrl: string;
  mimeType: string;
  tamano: number;
  createdAt: Date;
}): EmpleadoDocumento =>
  new EmpleadoDocumento({
    id: record.id,
    empleadoId: record.empleadoId,
    tipo: record.tipo as EmpleadoDocumentoTipo,
    nombre: record.nombre,
    archivoUrl: record.archivoUrl,
    mimeType: record.mimeType,
    tamano: record.tamano,
    createdAt: record.createdAt.toISOString(),
  });

export const ensureEmpleadoUploadsDir = async (empleadoId: string) => {
  if (!empleadoId || typeof empleadoId !== 'string' || !empleadoId.trim()) {
    throw new Error('ID de empleado no provisto para asegurar directorio.');
  }
  const cleanId = empleadoId.trim();
  if (cleanId.includes('..') || cleanId.includes('/') || cleanId.includes('\\')) {
    throw new Error('ID de empleado contiene caracteres inválidos.');
  }
  await fs.mkdir(path.join(UPLOADS_ROOT, cleanId), { recursive: true });
};

export const isValidDocumentoTipo = (tipo: string): tipo is EmpleadoDocumentoTipo =>
  (EMPLEADO_DOCUMENTO_TIPOS as readonly string[]).includes(tipo);

export class PrismaEmpleadoDocumentoAdapter {
  async listByEmpleado(empleadoId: string): Promise<EmpleadoDocumento[]> {
    const records = await prisma.empleadoDocumento.findMany({
      where: { empleadoId },
      orderBy: [{ tipo: 'asc' }, { createdAt: 'desc' }],
    });
    return records.map(mapRecord);
  }

  async create(input: {
    empleadoId: string;
    tipo: EmpleadoDocumentoTipo;
    nombre: string;
    archivoUrl: string;
    mimeType: string;
    tamano: number;
  }): Promise<EmpleadoDocumento> {
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

  async delete(empleadoId: string, documentoId: string): Promise<void> {
    const record = await prisma.empleadoDocumento.findFirst({
      where: { id: documentoId, empleadoId },
    });

    if (!record) {
      throw new Error('Documento no encontrado');
    }

    await this.deleteFile(record.archivoUrl);
    await prisma.empleadoDocumento.delete({ where: { id: documentoId } });
  }

  async deleteAllForEmpleado(empleadoId: string): Promise<void> {
    if (!empleadoId || typeof empleadoId !== 'string' || !empleadoId.trim()) {
      throw new Error('[PrismaEmpleadoDocumentoAdapter] empleadoId es requerido para el borrado.');
    }
    const records = await prisma.empleadoDocumento.findMany({ where: { empleadoId } });
    for (const record of records) {
      await this.deleteFile(record.archivoUrl);
    }
    await prisma.empleadoDocumento.deleteMany({ where: { empleadoId } });
    await safeRemoveDir(UPLOADS_ROOT, empleadoId.trim());
  }

  private async deleteFile(archivoUrl: string): Promise<void> {
    await safeUnlinkFile(path.resolve('uploads'), archivoUrl);
  }
}

export { UPLOADS_ROOT as EMPLEADO_UPLOADS_ROOT };

