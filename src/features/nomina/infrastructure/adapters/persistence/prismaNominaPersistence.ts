import { prisma } from '../../../../../config/prismaClient.js';
import { Prisma } from '@prisma/client';

const SECUENCIA_MARCACIONES = [
  { tipo: 'ENTRADA', label: 'Entrada' },
  { tipo: 'INICIO_ALMUERZO', label: 'Inicio Almuerzo' },
  { tipo: 'FIN_ALMUERZO', label: 'Fin Almuerzo' },
  { tipo: 'SALIDA', label: 'Salida' },
];

const toDateOnly = (value: string | Date): Date => {
  const str = typeof value === 'string' ? value : value.toISOString().split('T')[0];
  return new Date(`${str}T00:00:00.000Z`);
};

const formatDate = (value: Date): string => value.toISOString().split('T')[0];

const defaultIngresos = () => ({
  decimoCuarto: 40.17,
  decimoTercero: 0,
  horasExtras: 0,
  trabajosEnEmpresa: 0,
  fondosReserva: 0,
});

const defaultEgresos = () => ({
  iess: 0,
  extensionConyuge: 0,
  prestamoQuirografario: 0,
  anticipos: 0,
  dctoHorasNoLaboradas: 0,
  multas: 0,
  dctoFiesta: 0,
  dctoHerramientas: 0,
  dctoGenerico: 0,
});

export class PrismaNominaPersistence {
  async listAsistencias(filters: { fechaInicio?: string; fechaFin?: string; empleadoId?: string }) {
    const where: Prisma.AsistenciaWhereInput = {};

    if (filters.empleadoId) {
      where.empleadoId = filters.empleadoId;
    }

    if (filters.fechaInicio || filters.fechaFin) {
      where.fechaHora = {};
      if (filters.fechaInicio) {
        where.fechaHora.gte = new Date(`${filters.fechaInicio}T00:00:00.000Z`);
      }
      if (filters.fechaFin) {
        where.fechaHora.lte = new Date(`${filters.fechaFin}T23:59:59.999Z`);
      }
    }

    const records = await prisma.asistencia.findMany({
      where,
      include: { empleado: true },
      orderBy: { fechaHora: 'desc' },
    });

    return records.map((record: (typeof records)[number]) => ({
      id: record.id,
      empleadoId: record.empleadoId,
      nombreEmpleado: record.empleado.nombre,
      tipo: record.tipo,
      label: record.label,
      fechaHora: record.fechaHora.toISOString(),
      ubicacion:
        record.ubicacionLat != null && record.ubicacionLng != null
          ? { lat: record.ubicacionLat, lng: record.ubicacionLng }
          : null,
    }));
  }

  async getProximaMarcacion(empleadoId: string) {
    const empleado = await prisma.empleado.findUnique({ where: { id: empleadoId } });
    if (!empleado) return null;

    const hoy = formatDate(new Date());
    const inicio = new Date(`${hoy}T00:00:00.000Z`);
    const fin = new Date(`${hoy}T23:59:59.999Z`);

    const registrosHoy = await prisma.asistencia.findMany({
      where: { empleadoId, fechaHora: { gte: inicio, lte: fin } },
      orderBy: { fechaHora: 'asc' },
    });

    return SECUENCIA_MARCACIONES[registrosHoy.length] ?? null;
  }

  async registrarAsistencia(input: {
    empleadoId: string;
    ubicacion?: { lat?: number; lng?: number } | null;
  }) {
    const empleado = await prisma.empleado.findUnique({ where: { id: input.empleadoId } });
    if (!empleado) {
      throw new Error('Empleado no encontrado');
    }

    const siguiente = await this.getProximaMarcacion(input.empleadoId);
    if (!siguiente) {
      throw new Error(`El empleado ${input.empleadoId} ya completó las 4 marcaciones del día.`);
    }

    const record = await prisma.asistencia.create({
      data: {
        empleadoId: input.empleadoId,
        tipo: siguiente.tipo,
        label: siguiente.label,
        fechaHora: new Date(),
        ubicacionLat: input.ubicacion?.lat ?? null,
        ubicacionLng: input.ubicacion?.lng ?? null,
      },
      include: { empleado: true },
    });

    return {
      id: record.id,
      empleadoId: record.empleadoId,
      nombreEmpleado: record.empleado.nombre,
      tipo: record.tipo,
      label: record.label,
      fechaHora: record.fechaHora.toISOString(),
      ubicacion:
        record.ubicacionLat != null && record.ubicacionLng != null
          ? { lat: record.ubicacionLat, lng: record.ubicacionLng }
          : null,
    };
  }

  async listVacaciones(anio: number) {
    const records = await prisma.vacacion.findMany({
      where: { anio },
      orderBy: { empleadoId: 'asc' },
    });

    return records.map((record: (typeof records)[number]) => ({
      empleadoId: record.empleadoId,
      anio: record.anio,
      diasTomados: Array.isArray(record.diasTomados) ? record.diasTomados : [],
    }));
  }

  async upsertVacacion(input: { empleadoId: string; anio: number; diasTomados: string[] }) {
    const empleado = await prisma.empleado.findUnique({ where: { id: input.empleadoId } });
    if (!empleado) {
      throw new Error('Empleado no encontrado');
    }

    const record = await prisma.vacacion.upsert({
      where: {
        empleadoId_anio: {
          empleadoId: input.empleadoId,
          anio: input.anio,
        },
      },
      create: {
        empleadoId: input.empleadoId,
        anio: input.anio,
        diasTomados: input.diasTomados,
      },
      update: {
        diasTomados: input.diasTomados,
      },
    });

    return {
      empleadoId: record.empleadoId,
      anio: record.anio,
      diasTomados: Array.isArray(record.diasTomados) ? record.diasTomados : [],
    };
  }

  async listHorasExtras(fechaInicio: string, fechaFin: string) {
    const records = await prisma.horaExtra.findMany({
      where: {
        fecha: {
          gte: toDateOnly(fechaInicio),
          lte: toDateOnly(fechaFin),
        },
      },
      orderBy: [{ fecha: 'asc' }, { colaboradorId: 'asc' }],
    });

    return records.map((record: (typeof records)[number]) => ({
      id: record.id,
      fecha: formatDate(record.fecha),
      colaboradorId: record.colaboradorId,
      horas: Number(record.horas),
      detalleHorario: record.detalleHorario,
      descripcion: record.descripcion,
      valorPorHora: Number(record.valorPorHora),
      total: Number(record.total),
    }));
  }

  async saveHorasExtrasBulk(
    fechaInicio: string,
    fechaFin: string,
    records: Array<{
      id?: string;
      fecha: string;
      colaboradorId: string;
      horas: number;
      detalleHorario?: string;
      descripcion?: string;
      valorPorHora?: number;
      total?: number;
    }>
  ) {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.horaExtra.deleteMany({
        where: {
          fecha: {
            gte: toDateOnly(fechaInicio),
            lte: toDateOnly(fechaFin),
          },
        },
      });

      for (const item of records) {
        const horas = Number(item.horas) || 0;
        const valorPorHora = Number(item.valorPorHora ?? 2.5);
        const total = item.total !== undefined ? Number(item.total) : horas * valorPorHora;

        await tx.horaExtra.create({
          data: {
            id: item.id && item.id.length > 8 ? item.id : undefined,
            fecha: toDateOnly(item.fecha),
            colaboradorId: item.colaboradorId,
            horas,
            detalleHorario: item.detalleHorario ?? '',
            descripcion: item.descripcion ?? '',
            valorPorHora,
            total,
          },
        });
      }
    });

    return this.listHorasExtras(fechaInicio, fechaFin);
  }

  private mapNomina(record: {
    empleadoId: string;
    fechaInicio: Date;
    fechaFin: Date;
    diasLaborables: number;
    diasLaborados: number;
    permisoHoras: Prisma.Decimal;
    ingresos: Prisma.JsonValue;
    egresos: Prisma.JsonValue;
    abonos: Prisma.JsonValue;
    estado: string;
  }) {
    return {
      empleadoId: record.empleadoId,
      fechaInicio: formatDate(record.fechaInicio),
      fechaFin: formatDate(record.fechaFin),
      diasLaborables: record.diasLaborables,
      diasLaborados: record.diasLaborados,
      permisoHoras: Number(record.permisoHoras),
      ingresos: record.ingresos as Record<string, number>,
      egresos: record.egresos as Record<string, number>,
      abonos: record.abonos as Array<{ monto: number; fecha: string }>,
      estado: record.estado,
    };
  }

  async listNominas(fechaInicio: string, fechaFin: string) {
    const inicio = toDateOnly(fechaInicio);
    const fin = toDateOnly(fechaFin);

    let records = await prisma.nominaRegistro.findMany({
      where: { fechaInicio: inicio, fechaFin: fin },
      orderBy: { empleadoId: 'asc' },
    });

    if (records.length === 0) {
      const empleados = await prisma.empleado.findMany({ orderBy: { id: 'asc' } });
      const diffDias = Math.floor((fin.getTime() - inicio.getTime()) / 86400000) + 1;

      for (const empleado of empleados) {
        await prisma.nominaRegistro.create({
          data: {
            empleadoId: empleado.id,
            fechaInicio: inicio,
            fechaFin: fin,
            diasLaborables: diffDias,
            diasLaborados: diffDias,
            ingresos: defaultIngresos(),
            egresos: defaultEgresos(),
            abonos: [],
            estado: 'PENDIENTE',
          },
        });
      }

      records = await prisma.nominaRegistro.findMany({
        where: { fechaInicio: inicio, fechaFin: fin },
        orderBy: { empleadoId: 'asc' },
      });
    }

    return records.map((record: (typeof records)[number]) => this.mapNomina(record));
  }

  async saveNomina(input: {
    empleadoId: string;
    fechaInicio: string;
    fechaFin: string;
    diasLaborables?: number;
    diasLaborados?: number;
    permisoHoras?: number;
    ingresos?: Record<string, number>;
    egresos?: Record<string, number>;
    abonos?: Array<{ monto: number; fecha: string }>;
    estado?: string;
  }) {
    const inicio = toDateOnly(input.fechaInicio);
    const fin = toDateOnly(input.fechaFin);

    const record = await prisma.nominaRegistro.upsert({
      where: {
        empleadoId_fechaInicio_fechaFin: {
          empleadoId: input.empleadoId,
          fechaInicio: inicio,
          fechaFin: fin,
        },
      },
      create: {
        empleadoId: input.empleadoId,
        fechaInicio: inicio,
        fechaFin: fin,
        diasLaborables: input.diasLaborables ?? 30,
        diasLaborados: input.diasLaborados ?? 30,
        permisoHoras: input.permisoHoras ?? 0,
        ingresos: input.ingresos ?? defaultIngresos(),
        egresos: input.egresos ?? defaultEgresos(),
        abonos: input.abonos ?? [],
        estado: input.estado ?? 'PENDIENTE',
      },
      update: {
        diasLaborables: input.diasLaborables ?? 30,
        diasLaborados: input.diasLaborados ?? 30,
        permisoHoras: input.permisoHoras ?? 0,
        ingresos: input.ingresos ?? defaultIngresos(),
        egresos: input.egresos ?? defaultEgresos(),
        abonos: input.abonos ?? [],
        estado: input.estado ?? 'PENDIENTE',
      },
    });

    return this.mapNomina(record);
  }
}
