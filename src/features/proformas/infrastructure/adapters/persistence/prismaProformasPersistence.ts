import { Prisma } from '@prisma/client';
import { prisma } from '../../../../../config/prismaClient.js';

export interface ProformaItemInput {
  cod?: string;
  descripcion: string;
  cantidad: number;
  ancho?: number;
  alto?: number;
  metraje?: number;
  metrajeTotal?: number;
  precioUnitario: number;
  valor?: number;
}

export interface ProformaInput {
  id?: string;
  clienteId?: string | null;
  cliente: string;
  telefono?: string;
  email?: string;
  direccion?: string;
  fecha: string;
  vencimiento?: string;
  diasValidez?: number;
  items: ProformaItemInput[];
  iva?: number;
  descuento?: number;
  notas?: string;
  medio?: string;
  estado?: string;
}

const toDate = (value?: string | null): Date | null => {
  if (!value) return null;
  return new Date(`${value}T12:00:00.000Z`);
};

const formatDate = (value: Date | null | undefined): string => {
  if (!value) return '';
  return value.toISOString().split('T')[0];
};

const mapProforma = (record: {
  id: string;
  clienteId: string | null;
  clienteNombre: string;
  telefono: string;
  email: string;
  direccion?: string;
  fecha: Date;
  vencimiento: Date | null;
  diasValidez?: number;
  iva: Prisma.Decimal;
  descuento?: number | null;
  notas: string;
  medio?: string;
  estado: string;
  items: Array<{
    id?: string;
    cod?: string | null;
    descripcion: string;
    cantidad: Prisma.Decimal;
    ancho?: number | null;
    alto?: number | null;
    metraje?: number | null;
    metrajeTotal?: number | null;
    precioUnitario: Prisma.Decimal;
    valor?: number | null;
    orden: number;
  }>;
}) => ({
  id: record.id,
  clienteId: record.clienteId ?? '',
  cliente: record.clienteNombre,
  telefono: record.telefono,
  email: record.email,
  direccion: record.direccion ?? '',
  fecha: formatDate(record.fecha),
  vencimiento: formatDate(record.vencimiento),
  diasValidez: record.diasValidez ?? 3,
  items: record.items
    .sort((a, b) => a.orden - b.orden)
    .map((item) => ({
      id: item.id,
      cod: item.cod ?? undefined,
      descripcion: item.descripcion,
      cantidad: Number(item.cantidad),
      ancho: item.ancho ?? undefined,
      alto: item.alto ?? undefined,
      metraje: item.metraje ?? undefined,
      metrajeTotal: item.metrajeTotal ?? undefined,
      precioUnitario: Number(item.precioUnitario),
      valor: item.valor ?? undefined,
    })),
  iva: Number(record.iva),
  descuento: record.descuento ?? 0,
  notas: record.notas,
  medio: record.medio || 'LUXES',
  estado: record.estado,
});

const nextSequentialId = (prefix: string, ids: string[]): string => {
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

  async saveProforma(input: ProformaInput) {
    const fecha = toDate(input.fecha);
    if (!fecha) throw new Error('La fecha de emisión es obligatoria');

    const items = (input.items ?? []).filter((item) => item.descripcion?.trim());
    if (items.length === 0) throw new Error('Debe incluir al menos un artículo');

    const baseData = {
      clienteId: input.clienteId || null,
      clienteNombre: input.cliente,
      telefono: input.telefono ?? '',
      email: input.email ?? '',
      direccion: input.direccion ?? '',
      fecha,
      vencimiento: toDate(input.vencimiento),
      diasValidez: input.diasValidez ?? 3,
      iva: input.iva ?? 0.12,
      descuento: input.descuento ?? 0,
      notas: input.notas ?? '',
      medio: input.medio ?? 'ALUX',
      estado: input.estado ?? 'Pendiente',
    };

    if (input.id) {
      const record = await prisma.$transaction(async (tx) => {
        await tx.proformaItem.deleteMany({ where: { proformaId: input.id! } });
        return tx.proforma.update({
          where: { id: input.id },
          data: {
            ...baseData,
            items: {
              create: items.map((item, orden) => ({
                cod: item.cod ?? null,
                descripcion: item.descripcion,
                cantidad: item.cantidad,
                ancho: item.ancho ?? null,
                alto: item.alto ?? null,
                metraje: item.metraje ?? null,
                metrajeTotal: item.metrajeTotal ?? null,
                precioUnitario: item.precioUnitario,
                valor: item.valor ?? null,
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
            cod: item.cod ?? null,
            descripcion: item.descripcion,
            cantidad: item.cantidad,
            ancho: item.ancho ?? null,
            alto: item.alto ?? null,
            metraje: item.metraje ?? null,
            metrajeTotal: item.metrajeTotal ?? null,
            precioUnitario: item.precioUnitario,
            valor: item.valor ?? null,
            orden,
          })),
        },
      },
      include: { items: true },
    });

    return mapProforma(record);
  }

  async updateProformaEstado(id: string, estado: string) {
    const record = await prisma.proforma.update({
      where: { id },
      data: { estado },
      include: { items: true },
    });
    return mapProforma(record);
  }

  async deleteProforma(id: string) {
    await prisma.proforma.delete({ where: { id } });
    return id;
  }
}
