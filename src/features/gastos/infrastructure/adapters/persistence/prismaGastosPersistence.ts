import { Prisma } from '@prisma/client';
import { prisma } from '../../../../../config/prismaClient.js';

export interface GastoInput {
  id?: string;
  concepto: string;
  categoria?: string;
  fecha: string;
  monto: number;
  proveedor?: string;
  notas?: string;
}

export interface VehiculoInput {
  id?: string;
  placa: string;
  marca?: string;
  modelo?: string;
  anio?: number | null;
  color?: string;
  kilometraje?: number;
  responsable?: string;
  notas?: string;
  estado?: string;
}

export interface MantenimientoInput {
  id?: string;
  vehiculoId: string;
  tipo: string;
  descripcion?: string;
  fechaRealizado: string;
  fechaProxima?: string;
  kilometraje?: number | null;
  kmProximo?: number | null;
  monto?: number;
  proveedor?: string;
  notas?: string;
}

const formatDate = (value: Date | null | undefined): string => {
  if (!value) return '';
  return value.toISOString().split('T')[0];
};

const toDate = (value?: string | null): Date | null => {
  if (!value) return null;
  return new Date(`${value}T12:00:00.000Z`);
};

const nextSequentialId = (prefix: string, ids: string[]): string => {
  const maxNum = ids.reduce((max, id) => {
    const n = parseInt(id.replace(`${prefix}-`, ''), 10);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
  return `${prefix}-${String(maxNum + 1).padStart(3, '0')}`;
};

const mapGasto = (record: {
  id: string;
  concepto: string;
  categoria: string;
  fecha: Date;
  monto: Prisma.Decimal;
  proveedor: string;
  notas: string;
}) => ({
  id: record.id,
  concepto: record.concepto,
  categoria: record.categoria,
  fecha: formatDate(record.fecha),
  monto: Number(record.monto),
  proveedor: record.proveedor,
  notas: record.notas,
});

const mapVehiculo = (record: {
  id: string;
  placa: string;
  marca: string;
  modelo: string;
  anio: number | null;
  color: string;
  kilometraje: number;
  responsable: string;
  notas: string;
  estado: string;
  mantenimientos?: Array<{
    id: string;
    vehiculoId: string;
    tipo: string;
    descripcion: string;
    fechaRealizado: Date;
    fechaProxima: Date | null;
    kilometraje: number | null;
    kmProximo: number | null;
    monto: Prisma.Decimal;
    proveedor: string;
    notas: string;
  }>;
}) => ({
  id: record.id,
  placa: record.placa,
  marca: record.marca,
  modelo: record.modelo,
  anio: record.anio,
  color: record.color,
  kilometraje: record.kilometraje,
  responsable: record.responsable,
  notas: record.notas,
  estado: record.estado,
  mantenimientos: record.mantenimientos
    ? record.mantenimientos.map(mapMantenimiento)
    : undefined,
});

const mapMantenimiento = (record: {
  id: string;
  vehiculoId: string;
  tipo: string;
  descripcion: string;
  fechaRealizado: Date;
  fechaProxima: Date | null;
  kilometraje: number | null;
  kmProximo: number | null;
  monto: Prisma.Decimal;
  proveedor: string;
  notas: string;
}) => ({
  id: record.id,
  vehiculoId: record.vehiculoId,
  tipo: record.tipo,
  descripcion: record.descripcion,
  fechaRealizado: formatDate(record.fechaRealizado),
  fechaProxima: formatDate(record.fechaProxima),
  kilometraje: record.kilometraje,
  kmProximo: record.kmProximo,
  monto: Number(record.monto),
  proveedor: record.proveedor,
  notas: record.notas,
});

export class PrismaGastosPersistence {
  async listGastos() {
    const records = await prisma.gasto.findMany({ orderBy: { fecha: 'desc' } });
    return records.map(mapGasto);
  }

  async saveGasto(input: GastoInput) {
    const fecha = toDate(input.fecha);
    if (!fecha) throw new Error('La fecha es obligatoria');

    const data = {
      concepto: input.concepto,
      categoria: input.categoria ?? 'oficina',
      fecha,
      monto: input.monto,
      proveedor: input.proveedor ?? '',
      notas: input.notas ?? '',
    };

    if (input.id) {
      const record = await prisma.gasto.update({ where: { id: input.id }, data });
      return mapGasto(record);
    }

    const ids = (await prisma.gasto.findMany({ select: { id: true } })).map((g) => g.id);
    const id = nextSequentialId('GTO', ids);
    const record = await prisma.gasto.create({ data: { id, ...data } });
    return mapGasto(record);
  }

  async deleteGasto(id: string) {
    await prisma.gasto.delete({ where: { id } });
    return id;
  }

  async listVehiculos() {
    const records = await prisma.vehiculo.findMany({
      include: {
        mantenimientos: { orderBy: { fechaRealizado: 'desc' } },
      },
      orderBy: { placa: 'asc' },
    });
    return records.map(mapVehiculo);
  }

  async saveVehiculo(input: VehiculoInput) {
    const data = {
      placa: input.placa.trim().toUpperCase(),
      marca: input.marca ?? '',
      modelo: input.modelo ?? '',
      anio: input.anio ?? null,
      color: input.color ?? '',
      kilometraje: input.kilometraje ?? 0,
      responsable: input.responsable ?? '',
      notas: input.notas ?? '',
      estado: input.estado ?? 'activo',
    };

    if (input.id) {
      const record = await prisma.vehiculo.update({
        where: { id: input.id },
        data,
        include: { mantenimientos: { orderBy: { fechaRealizado: 'desc' } } },
      });
      return mapVehiculo(record);
    }

    const ids = (await prisma.vehiculo.findMany({ select: { id: true } })).map((v) => v.id);
    const id = nextSequentialId('VEH', ids);
    const record = await prisma.vehiculo.create({
      data: { id, ...data },
      include: { mantenimientos: { orderBy: { fechaRealizado: 'desc' } } },
    });
    return mapVehiculo(record);
  }

  async deleteVehiculo(id: string) {
    await prisma.vehiculo.delete({ where: { id } });
    return id;
  }

  async listMantenimientos(vehiculoId: string) {
    const records = await prisma.vehiculoMantenimiento.findMany({
      where: { vehiculoId },
      orderBy: { fechaRealizado: 'desc' },
    });
    return records.map(mapMantenimiento);
  }

  async saveMantenimiento(input: MantenimientoInput) {
    const fechaRealizado = toDate(input.fechaRealizado);
    if (!fechaRealizado) throw new Error('La fecha de mantenimiento es obligatoria');

    const vehiculo = await prisma.vehiculo.findUnique({ where: { id: input.vehiculoId } });
    if (!vehiculo) throw new Error('Vehículo no encontrado');

    const data = {
      vehiculoId: input.vehiculoId,
      tipo: input.tipo,
      descripcion: input.descripcion ?? '',
      fechaRealizado,
      fechaProxima: toDate(input.fechaProxima),
      kilometraje: input.kilometraje ?? null,
      kmProximo: input.kmProximo ?? null,
      monto: input.monto ?? 0,
      proveedor: input.proveedor ?? '',
      notas: input.notas ?? '',
    };

    if (input.kilometraje && input.kilometraje > vehiculo.kilometraje) {
      await prisma.vehiculo.update({
        where: { id: input.vehiculoId },
        data: { kilometraje: input.kilometraje },
      });
    }

    if (input.id) {
      const record = await prisma.vehiculoMantenimiento.update({
        where: { id: input.id },
        data,
      });
      return mapMantenimiento(record);
    }

    const record = await prisma.vehiculoMantenimiento.create({ data });
    return mapMantenimiento(record);
  }

  async deleteMantenimiento(id: string) {
    await prisma.vehiculoMantenimiento.delete({ where: { id } });
    return id;
  }
}
