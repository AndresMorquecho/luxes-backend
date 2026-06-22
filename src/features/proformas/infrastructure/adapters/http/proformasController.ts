import type { Request, Response } from 'express';
import { prisma } from '../../../../../config/prismaClient.js';
import { sendPushToRole } from '../../../../../shared/services/pushNotificationService.js';

/** Genera el siguiente ID con formato PRO-### */
async function nextProformaId(): Promise<string> {
  const rows = await prisma.proforma.findMany({ select: { id: true } });
  const max = rows.reduce((m, r) => {
    const n = parseInt(String(r.id).replace('PRO-', ''), 10);
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return `PRO-${String(max + 1).padStart(3, '0')}`;
}

const toDateStr = (d: Date | null | undefined): string =>
  d ? new Date(d).toISOString().split('T')[0] : '';

/** Mapea el registro Prisma a la forma que consume el frontend */
function mapProforma(p: any) {
  return {
    id: p.id,
    clienteId: p.clienteId,
    cliente: p.clienteNombre,
    telefono: p.telefono,
    email: p.email,
    fecha: toDateStr(p.fecha),
    vencimiento: p.vencimiento ? toDateStr(p.vencimiento) : '',
    diasValidez: p.diasValidez,
    atiende: p.atiende,
    condiciones: p.condiciones,
    iva: Number(p.iva),
    notas: p.notas,
    estado: p.estado,
    metodoPagoId: p.metodoPagoId,
    metodoPago: p.metodoPago,
    items: (p.items || [])
      .slice()
      .sort((a: any, b: any) => a.orden - b.orden)
      .map((i: any) => ({
        descripcion: i.descripcion,
        cantidad: Number(i.cantidad),
        precioUnitario: Number(i.precioUnitario),
      })),
    abonos: (p.abonos || []).map((ab: any) => ({
      id: ab.id,
      monto: Number(ab.monto),
      fecha: toDateStr(ab.fecha),
      referencia: ab.referencia,
      metodoPago: ab.metodoPago ? { id: ab.metodoPago.id, nombre: ab.metodoPago.nombre } : null,
    })),
  };
}

/** Construye los datos de ítems para Prisma a partir del body */
function buildItems(items: any[]): any[] {
  return (Array.isArray(items) ? items : []).map((it, idx) => ({
    descripcion: it.descripcion || '',
    cantidad: Number(it.cantidad) || 0,
    precioUnitario: Number(it.precioUnitario) || 0,
    orden: idx,
  }));
}

/** Valida que el clienteId exista; si no, devuelve null para no romper la FK */
async function resolveClienteId(clienteId: any): Promise<string | null> {
  if (!clienteId) return null;
  const c = await prisma.cliente.findUnique({ where: { id: String(clienteId) } });
  return c ? c.id : null;
}

export class ProformasController {
  async list(req: Request, res: Response): Promise<Response> {
    try {
      const { 
        page = '1', 
        limit = '20', 
        search = '', 
        estado = '',
        fechaDesde = '',
        fechaHasta = ''
      } = req.query;

      const pageNum = Math.max(1, parseInt(String(page), 10));
      const limitNum = Math.max(1, Math.min(100, parseInt(String(limit), 10)));
      const skip = (pageNum - 1) * limitNum;

      // Construir filtros dinámicos
      const where: any = {};

      // Excluir rechazadas por defecto a menos que se busque específicamente
      if (estado && String(estado).trim()) {
        const estStr = String(estado).trim();
        if (estStr === 'Aprobada') {
          where.estado = { in: ['Aprobada', 'Pagada'] };
        } else if (estStr.includes(',')) {
          where.estado = { in: estStr.split(',').map(s => s.trim()) };
        } else {
          where.estado = estStr;
        }
      } else {
        where.estado = { not: 'Rechazada' };
      }

      // Búsqueda por texto (cliente, ID, teléfono, email)
      if (search && String(search).trim()) {
        const searchTerm = String(search).trim();
        where.OR = [
          { clienteNombre: { contains: searchTerm, mode: 'insensitive' } },
          { id: { contains: searchTerm, mode: 'insensitive' } },
          { telefono: { contains: searchTerm } },
          { email: { contains: searchTerm, mode: 'insensitive' } },
        ];
      }

      // Filtro por rango de fechas
      if (fechaDesde || fechaHasta) {
        where.fecha = {};
        if (fechaDesde) {
          const desdeStr = String(fechaDesde);
          where.fecha.gte = desdeStr.includes('T') ? new Date(desdeStr) : new Date(desdeStr + 'T00:00:00');
        }
        if (fechaHasta) {
          // Incluir todo el día hasta las 23:59:59
          const hastaStr = String(fechaHasta);
          where.fecha.lte = hastaStr.includes('T') ? new Date(hastaStr) : new Date(hastaStr + 'T23:59:59.999');
        }
      }

      // Ejecutar consulta con paginación
      const [proformas, total] = await Promise.all([
        prisma.proforma.findMany({
          where,
          include: { items: true, metodoPago: true, abonos: { include: { metodoPago: true } } },
          orderBy: { fecha: 'desc' },
          skip,
          take: limitNum,
        }),
        prisma.proforma.count({ where }),
      ]);

      return res.status(200).json({ 
        success: true, 
        data: proformas.map(mapProforma),
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        }
      });
    } catch (error) {
      console.error('[proformas/list]', error);
      return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al obtener proformas' } });
    }
  }

  async create(req: Request, res: Response): Promise<Response> {
    try {
      const b = req.body || {};
      const id = await nextProformaId();
      const clienteId = await resolveClienteId(b.clienteId);
      const created = await prisma.proforma.create({
        data: {
          id,
          clienteId,
          clienteNombre: b.cliente ?? b.clienteNombre ?? '',
          telefono: b.telefono ?? '',
          email: b.email ?? '',
          fecha: b.fecha ? new Date(b.fecha) : new Date(),
          vencimiento: b.vencimiento ? new Date(b.vencimiento) : null,
          diasValidez: Number(b.diasValidez ?? 3),
          atiende: b.atiende ?? '',
          condiciones: b.condiciones ?? '',
          iva: Number(b.iva ?? 0.12),
          notas: b.notas ?? '',
          estado: b.estado ?? 'Pendiente',
          metodoPagoId: b.metodoPagoId || null,
          items: { create: buildItems(b.items) },
        },
        include: { items: true, metodoPago: true },
      });

      // Generar notificaciones para los administradores si la proforma se crea en estado Pendiente
      if (created.estado === 'Pendiente') {
        try {
          const subtotal = created.items.reduce((s: number, item: any) => s + (Number(item.cantidad) * Number(item.precioUnitario)), 0);
          const totalVal = subtotal * (1 + Number(created.iva));
          const createdByNom = (req as any).user?.nombre || created.atiende || 'Sistema';

          for (const roleName of ['admin', 'administrador']) {
            await prisma.notification.create({
              data: {
                title: 'Nueva Proforma Pendiente de Aprobación',
                message: `Se ha generado la proforma ${created.id} para el cliente "${created.clienteNombre}" por un total de $${totalVal.toFixed(2)}. Requiere aprobación.`,
                rol: roleName,
                createdBy: createdByNom,
              },
            });

            await sendPushToRole(roleName, {
              title: 'Nueva Proforma Pendiente',
              body: `La proforma ${created.id} para "${created.clienteNombre}" de $${totalVal.toFixed(2)} requiere tu aprobación.`,
              data: {
                url: `/proformas/detalle/${created.id}`
              }
            }).catch(() => {});
          }
        } catch (notifErr) {
          console.error('[proformas/create/notify]', notifErr);
        }
      }

      return res.status(201).json({ success: true, data: mapProforma(created) });
    } catch (error) {
      console.error('[proformas/create]', error);
      return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al crear proforma' } });
    }
  }

  async update(req: Request, res: Response): Promise<Response> {
    try {
      const { id } = req.params;
      const b = req.body || {};
      const clienteId = await resolveClienteId(b.clienteId);

      // Reemplazamos los ítems por completo en una sola transacción anidada
      const updated = await prisma.proforma.update({
        where: { id: String(id) },
        data: {
          clienteId,
          clienteNombre: b.cliente ?? b.clienteNombre ?? '',
          telefono: b.telefono ?? '',
          email: b.email ?? '',
          fecha: b.fecha ? new Date(b.fecha) : undefined,
          vencimiento: b.vencimiento ? new Date(b.vencimiento) : null,
          diasValidez: Number(b.diasValidez ?? 3),
          atiende: b.atiende ?? '',
          condiciones: b.condiciones ?? '',
          iva: Number(b.iva ?? 0.12),
          notas: b.notas ?? '',
          estado: b.estado ?? 'Pendiente',
          metodoPagoId: b.metodoPagoId || null,
          items: {
            deleteMany: {},
            create: buildItems(b.items),
          },
        },
        include: { items: true, metodoPago: true },
      });
      return res.status(200).json({ success: true, data: mapProforma(updated) });
    } catch (error) {
      console.error('[proformas/update]', error);
      return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al actualizar proforma' } });
    }
  }

  async updateEstado(req: Request, res: Response): Promise<Response> {
    try {
      const { id } = req.params;
      const { estado, metodoPagoId } = req.body || {};
      const updated = await prisma.proforma.update({
        where: { id: String(id) },
        data: { 
          estado: String(estado),
          ...(metodoPagoId !== undefined && { metodoPagoId: metodoPagoId || null })
        },
        include: { items: true, metodoPago: true, abonos: { include: { metodoPago: true } } },
      });
      return res.status(200).json({ success: true, data: mapProforma(updated) });
    } catch (error) {
      console.error('[proformas/updateEstado]', error);
      return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al actualizar estado' } });
    }
  }

  async getById(req: Request, res: Response): Promise<Response> {
    try {
      const { id } = req.params;
      const proforma = await prisma.proforma.findUnique({
        where: { id: String(id) },
        include: {
          items: true,
          metodoPago: true,
          abonos: {
            include: { metodoPago: true }
          }
        }
      });
      if (!proforma) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Proforma no encontrada' } });
      }
      return res.status(200).json({ success: true, data: mapProforma(proforma) });
    } catch (error) {
      console.error('[proformas/getById]', error);
      return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al obtener proforma' } });
    }
  }

  async aprobar(req: Request, res: Response): Promise<Response> {
    try {
      const { id } = req.params;
      const b = req.body || {};
      const { monto, metodoPagoId, referencia } = b;

      const userRole = ((req as any).user?.rol || '').toUpperCase();
      const isAdmin = userRole === 'ADMIN' || userRole === 'ADMINISTRADOR';
      if (!isAdmin) {
        return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Solo los administradores pueden aprobar proformas' } });
      }

      if (monto === undefined || !metodoPagoId) {
        return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Monto y método de pago (caja) son requeridos para aprobar la proforma' } });
      }

      const proforma = await prisma.proforma.findUnique({
        where: { id: String(id) },
        include: { items: true },
      });

      if (!proforma) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Proforma no encontrada' } });
      }

      if (proforma.estado === 'Aprobada' || proforma.estado === 'Pagada') {
        return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Esta proforma ya fue aprobada previamente' } });
      }

      // Calcular total de la proforma
      const subtotal = proforma.items.reduce((s, item) => s + (Number(item.cantidad) * Number(item.precioUnitario)), 0);
      const total = subtotal * (1 + Number(proforma.iva));

      // Validar monto
      const abonoMonto = Number(monto);
      if (abonoMonto <= 0) {
        return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'El monto del abono debe ser mayor a cero' } });
      }
      if (abonoMonto > (total + 0.01)) {
        return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'El abono no puede superar el total de la proforma' } });
      }

      // Transacción para guardar abono y actualizar estado de la proforma
      const nuevoEstado = abonoMonto >= (total - 0.01) ? 'Pagada' : 'Aprobada';

      const result = await prisma.$transaction(async (tx) => {
        // 1. Crear el abono
        await tx.abonoProforma.create({
          data: {
            proformaId: proforma.id,
            metodoPagoId: String(metodoPagoId),
            monto: abonoMonto,
            referencia: referencia ?? '',
          },
        });

        // 2. Actualizar la proforma
        const updated = await tx.proforma.update({
          where: { id: proforma.id },
          data: {
            estado: nuevoEstado,
            metodoPagoId: String(metodoPagoId),
          },
          include: { items: true, metodoPago: true, abonos: { include: { metodoPago: true } } },
        });

        return updated;
      });

      return res.status(200).json({ success: true, data: mapProforma(result) });
    } catch (error) {
      console.error('[proformas/aprobar]', error);
      return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al aprobar proforma' } });
    }
  }

  async rechazar(req: Request, res: Response): Promise<Response> {
    try {
      const { id } = req.params;

      const userRole = ((req as any).user?.rol || '').toUpperCase();
      const isAdmin = userRole === 'ADMIN' || userRole === 'ADMINISTRADOR';
      if (!isAdmin) {
        return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Solo los administradores pueden rechazar proformas' } });
      }

      const proforma = await prisma.proforma.findUnique({
        where: { id: String(id) },
      });

      if (!proforma) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Proforma no encontrada' } });
      }

      if (proforma.estado === 'Aprobada' || proforma.estado === 'Pagada' || proforma.estado === 'Rechazada') {
        return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: `No se puede rechazar una proforma en estado ${proforma.estado}` } });
      }

      const updated = await prisma.proforma.update({
        where: { id: proforma.id },
        data: { estado: 'Rechazada' },
        include: { items: true, metodoPago: true, abonos: { include: { metodoPago: true } } },
      });

      return res.status(200).json({ success: true, data: mapProforma(updated) });
    } catch (error) {
      console.error('[proformas/rechazar]', error);
      return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al rechazar proforma' } });
    }
  }

  async registrarAbono(req: Request, res: Response): Promise<Response> {
    try {
      const { id } = req.params;
      const b = req.body || {};
      const { monto, metodoPagoId, referencia } = b;

      if (monto === undefined || !metodoPagoId) {
        return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Monto y método de pago son requeridos' } });
      }

      const proforma = await prisma.proforma.findUnique({
        where: { id: String(id) },
        include: { items: true, abonos: true },
      });

      if (!proforma) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Proforma no encontrada' } });
      }

      if (proforma.estado !== 'Aprobada' && proforma.estado !== 'Pagada') {
        return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Solo se pueden registrar abonos en proformas aprobadas o pagadas' } });
      }

      // Calcular total de la proforma
      const subtotal = proforma.items.reduce((s, item) => s + (Number(item.cantidad) * Number(item.precioUnitario)), 0);
      const total = subtotal * (1 + Number(proforma.iva));

      // Calcular cuánto se ha pagado hasta ahora
      const yaCobrado = proforma.abonos.reduce((s, ab) => s + Number(ab.monto), 0);
      const pendiente = total - yaCobrado;

      const abonoMonto = Number(monto);
      if (abonoMonto <= 0) {
        return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'El monto del abono debe ser mayor a cero' } });
      }

      if (abonoMonto > (pendiente + 0.01)) {
        return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: `El abono de $${abonoMonto} supera el saldo pendiente de $${pendiente.toFixed(2)}` } });
      }

      const nuevoEstado = (yaCobrado + abonoMonto) >= (total - 0.01) ? 'Pagada' : 'Aprobada';

      const result = await prisma.$transaction(async (tx) => {
        // 1. Crear el abono
        await tx.abonoProforma.create({
          data: {
            proformaId: proforma.id,
            metodoPagoId: String(metodoPagoId),
            monto: abonoMonto,
            referencia: referencia ?? '',
          },
        });

        // 2. Actualizar la proforma
        const updated = await tx.proforma.update({
          where: { id: proforma.id },
          data: {
            estado: nuevoEstado,
          },
          include: { items: true, metodoPago: true, abonos: { include: { metodoPago: true } } },
        });

        return updated;
      });

      return res.status(200).json({ success: true, data: mapProforma(result) });
    } catch (error) {
      console.error('[proformas/registrarAbono]', error);
      return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al registrar abono' } });
    }
  }

  async remove(req: Request, res: Response): Promise<Response> {
    try {
      const { id } = req.params;
      await prisma.proforma.delete({ where: { id: String(id) } });
      return res.status(200).json({ success: true, data: { id } });
    } catch (error) {
      console.error('[proformas/remove]', error);
      return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al eliminar proforma' } });
    }
  }
}
