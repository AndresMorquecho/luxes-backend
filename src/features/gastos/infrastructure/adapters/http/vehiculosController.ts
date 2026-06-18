import type { Request, Response } from 'express';
import { prisma } from '../../../../../config/prismaClient.js';

async function nextVehiculoId(): Promise<string> {
  const rows = await prisma.vehiculo.findMany({ select: { id: true } });
  const max = rows.reduce((m, r) => {
    const match = String(r.id).match(/^VEH-(\d+)$/);
    if (match) {
      const n = parseInt(match[1], 10);
      return Number.isFinite(n) && n > m ? n : m;
    }
    return m;
  }, 0);
  return `VEH-${String(max + 1).padStart(3, '0')}`;
}

async function nextGastoId(): Promise<string> {
  const rows = await prisma.gasto.findMany({ select: { id: true } });
  const max = rows.reduce((m, r) => {
    const match = String(r.id).match(/^GTO-(\d+)$/);
    if (match) {
      const n = parseInt(match[1], 10);
      return Number.isFinite(n) && n > m ? n : m;
    }
    return m;
  }, 0);
  return `GTO-${String(max + 1).padStart(3, '0')}`;
}

export class VehiculosController {
  // --- VEHÍCULOS ---

  async listVehiculos(_req: Request, res: Response): Promise<Response> {
    try {
      const vehiculos = await prisma.vehiculo.findMany({
        include: {
          mantenimientos: {
            include: { gasto: { include: { metodoPago: true } } },
            orderBy: { fechaRealizado: 'desc' },
          },
        },
        orderBy: { id: 'asc' },
      });
      return res.status(200).json({ success: true, data: vehiculos });
    } catch (error) {
      console.error('[vehiculos/list]', error);
      return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al obtener vehículos' } });
    }
  }

  async getVehiculo(req: Request, res: Response): Promise<Response> {
    try {
      const { id } = req.params;
      const vehiculo = await prisma.vehiculo.findUnique({
        where: { id: String(id) },
        include: {
          mantenimientos: {
            include: { gasto: { include: { metodoPago: true } } },
            orderBy: { fechaRealizado: 'desc' },
          },
        },
      });

      if (!vehiculo) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Vehículo no encontrado' } });
      }

      return res.status(200).json({ success: true, data: vehiculo });
    } catch (error) {
      console.error('[vehiculos/get]', error);
      return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al obtener detalles del vehículo' } });
    }
  }

  async createVehiculo(req: Request, res: Response): Promise<Response> {
    try {
      const b = req.body || {};
      if (!b.placa || !b.marca || !b.modelo) {
        return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Placa, marca y modelo son requeridos' } });
      }

      // Validar placa única
      const existente = await prisma.vehiculo.findUnique({ where: { placa: b.placa } });
      if (existente) {
        return res.status(400).json({ success: false, error: { code: 'DUPLICATE_PLACA', message: 'La placa ya está registrada' } });
      }

      const id = await nextVehiculoId();
      const vehiculo = await prisma.vehiculo.create({
        data: {
          id,
          placa: b.placa,
          marca: b.marca,
          modelo: b.modelo,
          anio: b.anio ? Number(b.anio) : null,
          color: b.color ?? '',
          kilometraje: b.kilometraje ? Number(b.kilometraje) : 0,
          responsable: b.responsable ?? '',
          notas: b.notas ?? '',
          estado: b.estado ?? 'activo',
        },
      });

      return res.status(201).json({ success: true, data: vehiculo });
    } catch (error) {
      console.error('[vehiculos/create]', error);
      return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al registrar vehículo' } });
    }
  }

  async updateVehiculo(req: Request, res: Response): Promise<Response> {
    try {
      const { id } = req.params;
      const b = req.body || {};

      if (!b.placa || !b.marca || !b.modelo) {
        return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Placa, marca y modelo son requeridos' } });
      }

      // Validar placa única para otros vehículos
      const existente = await prisma.vehiculo.findFirst({
        where: {
          placa: b.placa,
          id: { not: String(id) },
        },
      });
      if (existente) {
        return res.status(400).json({ success: false, error: { code: 'DUPLICATE_PLACA', message: 'La placa ya está registrada por otro vehículo' } });
      }

      const vehiculo = await prisma.vehiculo.update({
        where: { id: String(id) },
        data: {
          placa: b.placa,
          marca: b.marca,
          modelo: b.modelo,
          anio: b.anio ? Number(b.anio) : null,
          color: b.color ?? '',
          kilometraje: b.kilometraje ? Number(b.kilometraje) : 0,
          responsable: b.responsable ?? '',
          notas: b.notas ?? '',
          estado: b.estado ?? 'activo',
        },
      });

      return res.status(200).json({ success: true, data: vehiculo });
    } catch (error) {
      console.error('[vehiculos/update]', error);
      return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al actualizar vehículo' } });
    }
  }

  async removeVehiculo(req: Request, res: Response): Promise<Response> {
    try {
      const { id } = req.params;

      // Obtener mantenimientos para limpiar gastos relacionados
      const mantenimientos = await prisma.vehiculoMantenimiento.findMany({
        where: { vehiculoId: String(id) },
        select: { gastoId: true },
      });

      const gastoIds = mantenimientos.map(m => m.gastoId).filter(Boolean) as string[];

      // Eliminar gastos asociados primero
      if (gastoIds.length > 0) {
        await prisma.gasto.deleteMany({
          where: { id: { in: gastoIds } },
        });
      }

      // Eliminar vehículo (cascada elimina mantenimientos automáticamente)
      await prisma.vehiculo.delete({
        where: { id: String(id) },
      });

      return res.status(200).json({ success: true, data: { id } });
    } catch (error) {
      console.error('[vehiculos/remove]', error);
      return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al eliminar vehículo' } });
    }
  }

  // --- MANTENIMIENTOS ---

  async createMantenimiento(req: Request, res: Response): Promise<Response> {
    try {
      const { id: vehiculoId } = req.params; // ID del vehículo
      const b = req.body || {};

      if (!b.tipo || !b.fechaRealizado || b.monto === undefined) {
        return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Tipo, fecha realizado y monto son requeridos' } });
      }

      const vehiculo = await prisma.vehiculo.findUnique({
        where: { id: String(vehiculoId) },
      });

      if (!vehiculo) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Vehículo no encontrado' } });
      }

      // 1. Crear Gasto asociado
      const gastoId = await nextGastoId();
      await prisma.gasto.create({
        data: {
          id: gastoId,
          concepto: `Mantenimiento Vehículo: Placa ${vehiculo.placa} (${b.tipo})`,
          categoria: 'vehiculos',
          fecha: new Date(b.fechaRealizado),
          monto: Number(b.monto),
          proveedor: b.proveedor ?? '',
          notas: b.notas ?? '',
          metodoPagoId: b.metodoPagoId || null,
        },
      });

      // 2. Crear Mantenimiento
      const mantenimiento = await prisma.vehiculoMantenimiento.create({
        data: {
          vehiculoId: String(vehiculoId),
          tipo: b.tipo,
          descripcion: b.descripcion ?? '',
          fechaRealizado: new Date(b.fechaRealizado),
          fechaProxima: b.fechaProxima ? new Date(b.fechaProxima) : null,
          kilometraje: b.kilometraje ? Number(b.kilometraje) : null,
          kmProximo: b.kmProximo ? Number(b.kmProximo) : null,
          monto: Number(b.monto),
          proveedor: b.proveedor ?? '',
          notas: b.notas ?? '',
          gastoId,
        },
      });

      // 3. Si el kilometraje reportado es mayor, actualizar el kilometraje del vehículo
      if (b.kilometraje && Number(b.kilometraje) > vehiculo.kilometraje) {
        await prisma.vehiculo.update({
          where: { id: String(vehiculoId) },
          data: { kilometraje: Number(b.kilometraje) },
        });
      }

      return res.status(201).json({ success: true, data: mantenimiento });
    } catch (error) {
      console.error('[mantenimientos/create]', error);
      return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al registrar mantenimiento' } });
    }
  }

  async updateMantenimiento(req: Request, res: Response): Promise<Response> {
    try {
      const { mantenimientoId } = req.params;
      const b = req.body || {};

      if (!b.tipo || !b.fechaRealizado || b.monto === undefined) {
        return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Tipo, fecha realizado y monto son requeridos' } });
      }

      const mantenimiento = await prisma.vehiculoMantenimiento.findUnique({
        where: { id: String(mantenimientoId) },
        include: { vehiculo: true },
      });

      if (!mantenimiento) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Mantenimiento no encontrado' } });
      }

      // 1. Actualizar Gasto asociado
      if (mantenimiento.gastoId) {
        await prisma.gasto.update({
          where: { id: mantenimiento.gastoId },
          data: {
            concepto: `Mantenimiento Vehículo: Placa ${mantenimiento.vehiculo.placa} (${b.tipo})`,
            fecha: new Date(b.fechaRealizado),
            monto: Number(b.monto),
            proveedor: b.proveedor ?? '',
            notas: b.notas ?? '',
            metodoPagoId: b.metodoPagoId || null,
          },
        });
      }

      // 2. Actualizar Mantenimiento
      const actualizado = await prisma.vehiculoMantenimiento.update({
        where: { id: String(mantenimientoId) },
        data: {
          tipo: b.tipo,
          descripcion: b.descripcion ?? '',
          fechaRealizado: new Date(b.fechaRealizado),
          fechaProxima: b.fechaProxima ? new Date(b.fechaProxima) : null,
          kilometraje: b.kilometraje ? Number(b.kilometraje) : null,
          kmProximo: b.kmProximo ? Number(b.kmProximo) : null,
          monto: Number(b.monto),
          proveedor: b.proveedor ?? '',
          notas: b.notas ?? '',
        },
      });

      // 3. Si el kilometraje reportado es mayor, actualizar el kilometraje del vehículo
      if (b.kilometraje && Number(b.kilometraje) > mantenimiento.vehiculo.kilometraje) {
        await prisma.vehiculo.update({
          where: { id: maintenance_get_vehiculo_id_helper(mantenimiento) },
          data: { kilometraje: Number(b.kilometraje) },
        });
      }

      return res.status(200).json({ success: true, data: actualizado });
    } catch (error) {
      console.error('[mantenimientos/update]', error);
      return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al actualizar mantenimiento' } });
    }
  }

  async removeMantenimiento(req: Request, res: Response): Promise<Response> {
    try {
      const { mantenimientoId } = req.params;

      const mantenimiento = await prisma.vehiculoMantenimiento.findUnique({
        where: { id: String(mantenimientoId) },
      });

      if (!mantenimiento) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Mantenimiento no encontrado' } });
      }

      // Al eliminar el gasto, el mantenimiento se eliminará automáticamente en cascada debido a onDelete: Cascade
      if (mantenimiento.gastoId) {
        await prisma.gasto.delete({
          where: { id: mantenimiento.gastoId },
        });
      } else {
        await prisma.vehiculoMantenimiento.delete({
          where: { id: String(mantenimientoId) },
        });
      }

      return res.status(200).json({ success: true, data: { id: mantenimientoId } });
    } catch (error) {
      console.error('[mantenimientos/remove]', error);
      return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al eliminar mantenimiento' } });
    }
  }
}

function maintenance_get_vehiculo_id_helper(m: any): string {
  return m.vehiculoId || m.vehiculo?.id;
}
