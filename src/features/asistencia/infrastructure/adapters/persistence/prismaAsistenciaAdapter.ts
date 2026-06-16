import { Asistencia } from '../../../domain/entities/Asistencia.js';
import { AsistenciaInput, AsistenciaRepositoryPort } from '../../../domain/ports/AsistenciaRepositoryPort.js';

import { prisma } from '../../../../../config/prismaClient.js';

const mapRecord = (
  record: {
    id: string;
    empleadoId: string;
    tipo: string;
    label: string;
    fechaHora: Date;
    ubicacionLat: number | null;
    ubicacionLng: number | null;
    createdAt: Date;
  },
  nombreEmpleado?: string
): Asistencia =>
  new Asistencia({
    id: record.id,
    empleadoId: record.empleadoId,
    tipo: record.tipo,
    label: record.label,
    fechaHora: record.fechaHora.toISOString(),
    ubicacionLat: record.ubicacionLat,
    ubicacionLng: record.ubicacionLng,
    createdAt: record.createdAt.toISOString(),
    nombreEmpleado,
  });

export class PrismaAsistenciaAdapter extends AsistenciaRepositoryPort {
  async findAll(desde: Date, hasta: Date): Promise<Asistencia[]> {
    const records = await prisma.asistencia.findMany({
      where: {
        fechaHora: {
          gte: desde,
          lte: hasta,
        },
      },
      include: {
        empleado: {
          select: {
            nombre: true,
          },
        },
      },
      orderBy: { fechaHora: 'desc' },
    });

    return records.map((record) => mapRecord(record, record.empleado?.nombre));
  }


  async findTodayByEmpleado(empleadoId: string): Promise<Asistencia[]> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const records = await prisma.asistencia.findMany({
      where: {
        empleadoId,
        fechaHora: {
          gte: start,
          lte: end,
        },
      },
      orderBy: { fechaHora: 'asc' },
    });

    return records.map((record) => mapRecord(record));
  }

  async create(data: AsistenciaInput): Promise<Asistencia> {
    const record = await prisma.asistencia.create({
      data: {
        empleadoId: data.empleadoId,
        tipo: data.tipo,
        label: data.label,
        fechaHora: new Date(data.fechaHora),
        ubicacionLat: data.ubicacionLat,
        ubicacionLng: data.ubicacionLng,
      },
    });

    return mapRecord(record);
  }
}
