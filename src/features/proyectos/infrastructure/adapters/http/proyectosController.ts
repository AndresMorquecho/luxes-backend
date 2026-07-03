import type { Request, Response } from 'express';
import { prisma } from '../../../../../config/prismaClient.js';
import path from 'path';
import fs from 'fs/promises';
import { sendPushToRole } from '../../../../../shared/services/pushNotificationService.js';

const PROYECTOS_UPLOADS_ROOT = path.resolve('uploads/proyectos');

async function buildImagePreviewDataUrl(
  filePath: string,
  mimetype: string,
  maxBytes = 1_500_000,
): Promise<string | undefined> {
  if (!mimetype.startsWith('image/')) return undefined;
  try {
    const stat = await fs.stat(filePath);
    if (stat.size > maxBytes) return undefined;
    const buf = await fs.readFile(filePath);
    return `data:${mimetype};base64,${buf.toString('base64')}`;
  } catch {
    return undefined;
  }
}

export async function ensureProyectoUploadsDir(proyectoId: string) {
  await fs.mkdir(path.join(PROYECTOS_UPLOADS_ROOT, proyectoId), { recursive: true });
}

/** Genera el siguiente ID con formato PROY-### */
async function nextProyectoId(): Promise<string> {
  const rows = await prisma.proyecto.findMany({ select: { id: true } });
  const max = rows.reduce((m, r) => {
    const n = parseInt(String(r.id).replace('PROY-', ''), 10);
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return `PROY-${String(max + 1).padStart(3, '0')}`;
}

const toDateStr = (d: Date | null | undefined): string => {
  if (!d) return '';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '';
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/** Normaliza fecha de inicio del proyecto (YYYY-MM-DD → mediodía UTC) */
function parseFechaInicio(value?: unknown): Date {
  const str = typeof value === 'string' ? value.trim() : '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return new Date(`${str}T12:00:00.000Z`);
  }
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return new Date(`${y}-${m}-${d}T12:00:00.000Z`);
}

type InstalacionDatos = Record<string, unknown>;

function parseFaseDatos(datos: string | null | undefined): Record<string, unknown> {
  if (!datos) return {};
  try {
    return JSON.parse(datos) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function getPersonalEncuesta(
  proyectoId: string,
  datosInstalacion: InstalacionDatos,
  instalacion: {
    personalAsignado?: Array<{
      empleadoId: string;
      rol: string;
      empleado?: { nombre?: string | null } | null;
    }>;
  } | null,
) {
  const personalList: Array<{ empleadoId: string; id: string; nombre: string; rol: string }> = [];

  // 1. Personal de taller/instalación
  const desdeDatos = datosInstalacion.personalAsignado;
  if (Array.isArray(desdeDatos) && desdeDatos.length > 0) {
    desdeDatos.forEach((p: Record<string, any>, index: number) => {
      personalList.push({
        empleadoId: String(p.empleadoId || p.id || `personal-${index}`),
        id: String(p.empleadoId || p.id || `personal-${index}`),
        nombre: String(p.nombre || ''),
        rol: String(p.rol || 'Técnico'),
      });
    });
  } else if (instalacion && Array.isArray(instalacion.personalAsignado)) {
    instalacion.personalAsignado.forEach((p: any, index: number) => {
      personalList.push({
        empleadoId: p.empleadoId || `personal-${index}`,
        id: p.empleadoId || `personal-${index}`,
        nombre: p.empleado?.nombre || '',
        rol: p.rol || 'Técnico',
      });
    });
  }

  try {
    // 2. Diseñador (de la fase de DISEÑO)
    const faseDiseno = await prisma.proyectoFase.findUnique({
      where: {
        proyectoId_fase: {
          proyectoId: String(proyectoId),
          fase: 'DISEÑO',
        },
      },
    });
    if (faseDiseno?.datos) {
      try {
        const datosDiseno = JSON.parse(faseDiseno.datos);
        if (datosDiseno && datosDiseno.disenadorNombre) {
          const existeDisenador = personalList.some(
            (p) => p.nombre.toLowerCase() === datosDiseno.disenadorNombre.toLowerCase()
          );
          if (!existeDisenador) {
            personalList.push({
              empleadoId: 'disenador',
              id: 'disenador',
              nombre: datosDiseno.disenadorNombre,
              rol: 'Diseñador/Aprobador',
            });
          }
        }
      } catch (e) {
        console.error('[getPersonalEncuesta] Error parsing diseño data:', e);
      }
    }

    // 3. Ventas (de las proformas vinculadas al proyecto desde la fase COTIZACION)
    const faseCotizacion = await prisma.proyectoFase.findUnique({
      where: {
        proyectoId_fase: {
          proyectoId: String(proyectoId),
          fase: 'COTIZACION',
        },
      },
    });
    if (faseCotizacion?.datos) {
      try {
        const datosCotizacion = JSON.parse(faseCotizacion.datos);
        if (datosCotizacion && Array.isArray(datosCotizacion.cotizacionesSeleccionadas)) {
          datosCotizacion.cotizacionesSeleccionadas.forEach((c: any) => {
            const atiendeVal = c.atiende || c.creadoPor;
            if (atiendeVal && atiendeVal !== '—') {
              const existeVentas = personalList.some(
                (pa) => pa.nombre.toLowerCase() === atiendeVal.toLowerCase()
              );
              if (!existeVentas) {
                personalList.push({
                  empleadoId: `ventas-${c.id}`,
                  id: `ventas-${c.id}`,
                  nombre: atiendeVal,
                  rol: 'Asesor de Ventas',
                });
              }
            }
          });
        }
      } catch (e) {
        console.error('[getPersonalEncuesta] Error parsing cotización data:', e);
      }
    }
  } catch (dbErr) {
    console.error('[getPersonalEncuesta] Error querying DB:', dbErr);
  }

  return personalList;
}

function getInstalacionCompletionErrors(
  datos: InstalacionDatos,
  ordenesCompra: Array<{ estado?: string | null }> = [],
): string[] {
  const faltantes: string[] = [];

  if (!datos.fechaInstalacion || !datos.horaInstalacion) {
    faltantes.push('Debe iniciar la instalación en obra antes de finalizarla');
  }
  const personal = datos.personalAsignado;
  if (!Array.isArray(personal) || personal.length === 0) {
    faltantes.push('Debe asignar al menos un técnico');
  }
  const materiales = datos.materiales;
  if (!Array.isArray(materiales) || materiales.length === 0) {
    faltantes.push('Debe registrar al menos un material');
  }
  const evidencias = datos.evidencias;
  if (!Array.isArray(evidencias) || evidencias.length === 0) {
    faltantes.push('Debe subir al menos una evidencia fotográfica');
  }

  const ocSinRecibir = ordenesCompra.filter(
    (oc) => String(oc.estado || '').toLowerCase() === 'aprobada',
  );
  if (ocSinRecibir.length > 0) {
    faltantes.push(
      `Hay ${ocSinRecibir.length} orden(es) de compra aprobada(s) sin recibir`,
    );
  }

  return faltantes;
}

const PROGRESO_POR_FASE: Record<string, number> = {
  COTIZACION: 0,
  'DISEÑO': 20,
  PRODUCCION: 40,
  INSTALACION: 70,
  ENTREGA: 90,
  COMPLETADO: 100,
};

const proyectoInclude = {
  cliente: true,
  fases: true,
  instalacion: {
    include: {
      personalAsignado: {
        include: { empleado: true },
      },
      materiales: true,
    },
  },
  gastos: {
    orderBy: { fecha: 'desc' as const }
  },
  ordenesCompra: {
    include: { detalles: true, proveedor: true }
  }
};

function mapClienteProyecto(p: any) {
  const live = p.cliente;
  if (live) {
    const esEmpresa = live.tipo === 'Empresa';
    return {
      nombre: live.nombre || p.clienteNombre || '',
      empresa: esEmpresa ? live.nombre : (p.clienteEmpresa || ''),
      telefono: live.telefono ?? p.clienteTelefono ?? '',
      email: live.email ?? p.clienteEmail ?? '',
      direccion: live.direccion ?? p.clienteDireccion ?? '',
    };
  }
  return {
    nombre: p.clienteNombre,
    empresa: p.clienteEmpresa,
    telefono: p.clienteTelefono,
    email: p.clienteEmail,
    direccion: p.clienteDireccion,
  };
}

function mapProyecto(p: any) {
  return {
    id: p.id,
    nombre: p.nombre,
    clienteId: p.clienteId,
    cliente: mapClienteProyecto(p),
    responsable: p.responsable,
    requiereInstalacion: p.requiereInstalacion,
    faseActual: p.faseActual,
    progreso: p.progreso,
    prioridad: p.prioridad,
    estado: p.estado,
    montoEstimado: Number(p.montoEstimado),
    fechaCreacion: toDateStr(p.fechaCreacion),
    fechaInicio: toDateStr(p.fechaCreacion),
    fechaEntregaEstimada: toDateStr(p.fechaEntregaEstimada),
    fechaCompletado: toDateStr(p.fechaCompletado),
    descripcion: p.descripcion,
    etiquetas: p.etiquetas ? p.etiquetas.split(',').map((t: string) => t.trim()).filter(Boolean) : [],
    notas: p.notas,
    fases: (p.fases || []).reduce((acc: any, f: any) => {
      let datos = f.datos ? JSON.parse(f.datos) : {};
      if (
        f.fase === 'INSTALACION' &&
        datos.instalacionCompletada &&
        datos.fechaFin &&
        !datos.horaFin &&
        f.fechaCompletada
      ) {
        const d = new Date(f.fechaCompletada);
        datos = {
          ...datos,
          horaFin: d.toLocaleTimeString('es-EC', {
            timeZone: 'America/Guayaquil',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          }),
        };
      }
      acc[f.fase] = {
        completada: f.completada,
        fechaCompletada: toDateStr(f.fechaCompletada),
        fechaCompletadaAt: f.fechaCompletada ? new Date(f.fechaCompletada).toISOString() : '',
        datos,
      };
      return acc;
    }, {}),
    instalacion: p.instalacion ? {
      id: p.instalacion.id,
      fechaInstalacion: toDateStr(p.instalacion.fechaInstalacion),
      direccionInstalacion: p.instalacion.direccionInstalacion,
      notas: p.instalacion.notas,
      instalacionCompletada: p.instalacion.instalacionCompletada,
      notasCierre: p.instalacion.notasCierre,
      personalAsignado: (p.instalacion.personalAsignado || []).map((pa: any) => ({
        empleadoId: pa.empleadoId,
        nombre: pa.empleado?.nombre || '',
        rol: pa.rol,
      })),
      materiales: (p.instalacion.materiales || []).map((m: any) => ({
        nombre: m.nombre,
        cantidad: Number(m.cantidad),
        unidad: m.unidad,
        observacion: m.observacion,
      })),
    } : null,
    gastos: (p.gastos || []).map((g: any) => ({
      id: g.id,
      concepto: g.concepto,
      categoria: g.categoria,
      fecha: toDateStr(g.fecha),
      monto: Number(g.monto),
      proveedor: g.proveedor,
      notas: g.notas,
    })),
    ordenesCompra: (p.ordenesCompra || []).map((oc: any) => ({
      id: oc.id,
      numero: oc.numero,
      proyectoId: oc.proyectoId || p.id,
      fecha: toDateStr(oc.fecha),
      subtotal: Number(oc.subtotal),
      impuesto: Number(oc.impuesto),
      total: Number(oc.total),
      estado: oc.estado === 'pendiente_aprobacion' ? 'PENDIENTE' : oc.estado.toUpperCase(),
      estadoPago: oc.estadoPago,
      concepto: oc.concepto,
      notas: oc.notas,
      fechaCreacion: toDateStr(oc.fechaCreacion),
      fechaAprobacion: toDateStr(oc.fechaAprobacion),
      items: (oc.detalles || []).map((d: any) => ({
        sku: d.materialId ? d.materialId.slice(-8).toUpperCase() : 'ESP-LIBRE',
        nombre: d.descripcion,
        cantidadSolicitada: Number(d.cantidad),
        cantidadAprobada: Number(d.cantidad),
        precioUnitario: Number(d.precioUnitario),
        unidad: 'unidad',
        materialId: d.materialId
      })),
      comentarios: oc.notas || ''
    })),
  };
}

export class ProyectosController {
  async list(req: Request, res: Response): Promise<Response> {
    try {
      const {
        page = '1',
        limit = '20',
        search = '',
        estado = '',
        faseActual = '',
        prioridad = '',
      } = req.query;

      const pageNum = Math.max(1, parseInt(String(page), 10));
      const limitNum = Math.max(1, Math.min(1000, parseInt(String(limit), 10)));
      const skip = (pageNum - 1) * limitNum;

      const where: any = {};

      if (estado && String(estado).trim()) {
        where.estado = String(estado).trim();
      }

      if (faseActual && String(faseActual).trim()) {
        where.faseActual = String(faseActual).trim();
      }

      if (prioridad && String(prioridad).trim()) {
        where.prioridad = String(prioridad).trim();
      }

      if (search && String(search).trim()) {
        const searchTerm = String(search).trim();
        where.OR = [
          { nombre: { contains: searchTerm, mode: 'insensitive' } },
          { clienteNombre: { contains: searchTerm, mode: 'insensitive' } },
          { clienteEmpresa: { contains: searchTerm, mode: 'insensitive' } },
          { responsable: { contains: searchTerm, mode: 'insensitive' } },
          { descripcion: { contains: searchTerm, mode: 'insensitive' } },
        ];
      }

      const [proyectos, total] = await Promise.all([
        prisma.proyecto.findMany({
          where,
          include: proyectoInclude,
          orderBy: { fechaCreacion: 'desc' },
          skip,
          take: limitNum,
        }),
        prisma.proyecto.count({ where }),
      ]);

      return res.status(200).json({
        success: true,
        data: proyectos.map(mapProyecto),
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    } catch (error) {
      console.error('[proyectos/list]', error);
      return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al obtener proyectos' } });
    }
  }

  async getById(req: Request, res: Response): Promise<Response> {
    try {
      const { id } = req.params;
      const proyecto = await prisma.proyecto.findUnique({
        where: { id: String(id) },
        include: proyectoInclude,
      });

      if (!proyecto) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Proyecto no encontrado' } });
      }

      return res.status(200).json({ success: true, data: mapProyecto(proyecto) });
    } catch (error) {
      console.error('[proyectos/getById]', error);
      return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al obtener proyecto' } });
    }
  }

  async create(req: Request, res: Response): Promise<Response> {
    try {
      const b = req.body || {};
      
      // Generar ID personalizado
      const id = await nextProyectoId();
      
      const proyecto = await prisma.proyecto.create({
        data: {
          id,
          nombre: b.nombre || '',
          clienteId: b.clienteId || null,
          clienteNombre: b.cliente?.nombre || b.clienteNombre || '',
          clienteEmpresa: b.cliente?.empresa || b.clienteEmpresa || '',
          clienteTelefono: b.cliente?.telefono || b.clienteTelefono || '',
          clienteEmail: b.cliente?.email || b.clienteEmail || '',
          clienteDireccion: b.cliente?.direccion || b.clienteDireccion || '',
          responsable: b.responsable || '',
          requiereInstalacion: Boolean(b.requiereInstalacion),
          faseActual: b.faseActual || 'COTIZACION',
          progreso: b.progreso !== undefined ? Number(b.progreso) : (PROGRESO_POR_FASE[b.faseActual || 'COTIZACION'] ?? 0),
          prioridad: b.prioridad || 'MEDIA',
          estado: b.estado || 'ACTIVO',
          montoEstimado: Number(b.montoEstimado) || 0,
          fechaCreacion: parseFechaInicio(b.fechaCreacion ?? b.fechaInicio),
          fechaEntregaEstimada: b.fechaEntregaEstimada ? new Date(b.fechaEntregaEstimada) : null,
          descripcion: b.descripcion || '',
          etiquetas: Array.isArray(b.etiquetas) ? b.etiquetas.join(',') : (b.etiquetas || ''),
          notas: b.notas || '',
        },
        include: proyectoInclude,
      });

      // Si requiere instalación, enviar notificación push y de base de datos a administradores y taller
      if (proyecto.requiereInstalacion) {
        try {
          // UNA sola notificación por grupo de roles (taller + admin)
          for (const roleName of ['taller', 'admin']) {
            await prisma.notification.create({
              data: {
                title: 'Nuevo Proyecto con Instalación',
                message: `Se ha generado el nuevo proyecto "${proyecto.nombre}" con requerimiento de instalación.`,
                rol: roleName,
                createdBy: proyecto.responsable || 'Sistema',
              },
            });
          }

          const payload = {
            title: 'Nuevo Proyecto con Instalación',
            body: `Se ha creado el proyecto "${proyecto.nombre}" con requerimiento de instalación.`,
            icon: '/LogoGlobo.png',
            badge: '/LogoGlobo.png',
            data: {
              url: `/instalaciones`,
              action: 'view_installations',
              proyectoId: proyecto.id,
            },
          };
          await sendPushToRole('taller', payload);
          await sendPushToRole('admin', payload);
          console.log(`[Proyecto ${proyecto.id}] Notificaciones de proyecto con instalación enviadas a administradores y taller`);
        } catch (notifError) {
          console.error('[Proyecto Create] Error enviando notificación push:', notifError);
        }
      }

      return res.status(201).json({ success: true, data: mapProyecto(proyecto) });
    } catch (error) {
      console.error('[proyectos/create]', error);
      return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al crear proyecto' } });
    }
  }

  async update(req: Request, res: Response): Promise<Response> {
    try {
      const { id } = req.params;
      const b = req.body || {};

      const updateData: any = {};
      if (b.nombre !== undefined) updateData.nombre = b.nombre;
      if (b.clienteId !== undefined) updateData.clienteId = b.clienteId || null;
      if (b.cliente?.nombre !== undefined || b.clienteNombre !== undefined) {
        updateData.clienteNombre = b.cliente?.nombre || b.clienteNombre || '';
      }
      if (b.cliente?.empresa !== undefined || b.clienteEmpresa !== undefined) {
        updateData.clienteEmpresa = b.cliente?.empresa || b.clienteEmpresa || '';
      }
      if (b.cliente?.telefono !== undefined || b.clienteTelefono !== undefined) {
        updateData.clienteTelefono = b.cliente?.telefono || b.clienteTelefono || '';
      }
      if (b.cliente?.email !== undefined || b.clienteEmail !== undefined) {
        updateData.clienteEmail = b.cliente?.email || b.clienteEmail || '';
      }
      if (b.cliente?.direccion !== undefined || b.clienteDireccion !== undefined) {
        updateData.clienteDireccion = b.cliente?.direccion || b.clienteDireccion || '';
      }
      if (b.responsable !== undefined) updateData.responsable = b.responsable;
      if (b.requiereInstalacion !== undefined) updateData.requiereInstalacion = Boolean(b.requiereInstalacion);
      if (b.faseActual !== undefined) {
        updateData.faseActual = b.faseActual;
        if (b.progreso === undefined) {
          updateData.progreso = PROGRESO_POR_FASE[b.faseActual] ?? 0;
        }
      }
      if (b.progreso !== undefined) updateData.progreso = Number(b.progreso);
      if (b.prioridad !== undefined) updateData.prioridad = b.prioridad;
      if (b.estado !== undefined) {
        updateData.estado = b.estado;
        if (b.estado === 'COMPLETADO' && !b.fechaCompletado) {
          updateData.fechaCompletado = new Date();
        }
      }
      if (b.montoEstimado !== undefined) updateData.montoEstimado = Number(b.montoEstimado);
      if (b.fechaEntregaEstimada !== undefined) {
        updateData.fechaEntregaEstimada = b.fechaEntregaEstimada ? new Date(b.fechaEntregaEstimada) : null;
      }
      if (b.descripcion !== undefined) updateData.descripcion = b.descripcion;
      if (b.etiquetas !== undefined) {
        updateData.etiquetas = Array.isArray(b.etiquetas) ? b.etiquetas.join(',') : (b.etiquetas || '');
      }
      if (b.notas !== undefined) updateData.notas = b.notas;

      // Sincronizar gastos manuales del proyecto si vienen en el body
      if (b.gastos !== undefined && Array.isArray(b.gastos)) {
        try {
          await prisma.gasto.deleteMany({
            where: {
              proyectoId: String(id),
              NOT: {
                id: { startsWith: 'G-OC-' }
              }
            }
          });

          for (const g of b.gastos) {
            if (g.id && g.id.startsWith('G-OC-')) continue;
            await prisma.gasto.create({
              data: {
                id: g.id || `G-MAN-${Date.now()}-${Math.random()}`,
                concepto: g.concepto || '',
                categoria: 'proyecto',
                fecha: g.fecha ? new Date(g.fecha) : new Date(),
                monto: Number(g.monto) || 0,
                proveedor: g.proveedor || '',
                notas: g.notas || '',
                proyectoId: String(id),
              }
            });
          }
        } catch (syncGastoError) {
          console.error('[Proyecto Update] Error syncing manual gastos:', syncGastoError);
        }
      }

      const proyecto = await prisma.proyecto.update({
        where: { id: String(id) },
        data: updateData,
        include: proyectoInclude,
      });

      return res.status(200).json({ success: true, data: mapProyecto(proyecto) });
    } catch (error) {
      console.error('[proyectos/update]', error);
      return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al actualizar proyecto' } });
    }
  }

  async remove(req: Request, res: Response): Promise<Response> {
    try {
      const { id } = req.params;
      // Explicitly delete related print jobs to prevent orphaned jobs
      await prisma.impresionJob.deleteMany({ where: { proyectoId: String(id) } });
      await prisma.proyecto.delete({ where: { id: String(id) } });
      return res.status(200).json({ success: true, data: { id } });
    } catch (error) {
      console.error('[proyectos/remove]', error);
      return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al eliminar proyecto' } });
    }
  }

  async avanzarFase(req: Request, res: Response): Promise<Response> {
    try {
      const { id } = req.params;
      const { fase, datos = {} } = req.body || {};

      if (!fase) {
        return res.status(400).json({ success: false, error: { code: 'INVALID_INPUT', message: 'Fase es requerida' } });
      }

      // Obtener el proyecto para la notificación
      const proyecto = await prisma.proyecto.findUnique({
        where: { id: String(id) },
        include: { fases: true, ordenesCompra: true },
      });

      if (!proyecto) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Proyecto no encontrado' },
        });
      }

      // Obtener los datos anteriores de la fase de instalación
      const faseInstalacionAnterior = proyecto.fases?.find(f => f.fase === 'INSTALACION');
      let datosInstalacionAnterior: InstalacionDatos = {};
      if (faseInstalacionAnterior?.datos) {
        try {
          datosInstalacionAnterior = JSON.parse(faseInstalacionAnterior.datos);
        } catch (e) {
          console.error(e);
        }
      }

      const datosMerged: InstalacionDatos = {
        ...datosInstalacionAnterior,
        ...(datos as InstalacionDatos),
      };

      const faseAnterior = proyecto.fases?.find((f) => f.fase === String(fase));
      let datosFaseAnterior: Record<string, unknown> = {};
      if (faseAnterior?.datos) {
        try {
          datosFaseAnterior = JSON.parse(faseAnterior.datos);
        } catch (e) {
          console.error(e);
        }
      }

      if (String(fase) === 'INSTALACION' && datos.instalacionCompletada === true) {
        const errores = getInstalacionCompletionErrors(
          datosMerged,
          proyecto.ordenesCompra || [],
        );
        if (errores.length > 0) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'INSTALACION_INCOMPLETA',
              message: errores[0],
              details: errores,
            },
          });
        }
      }

      // Actualizar o crear la fase (merge con datos previos para no perder archivos u otros campos)
      const datosAGuardar =
        String(fase) === 'INSTALACION'
          ? datosMerged
          : { ...datosFaseAnterior, ...(datos as Record<string, unknown>) };

      await prisma.proyectoFase.upsert({
        where: {
          proyectoId_fase: {
            proyectoId: String(id),
            fase: String(fase),
          },
        },
        update: {
          completada: String(fase) === 'INSTALACION' ? (datos.instalacionCompletada === true) : true,
          fechaCompletada: (String(fase) === 'INSTALACION' ? (datos.instalacionCompletada === true) : true) ? new Date() : null,
          datos: JSON.stringify(datosAGuardar),
        },
        create: {
          proyectoId: String(id),
          fase: String(fase),
          completada: String(fase) === 'INSTALACION' ? (datos.instalacionCompletada === true) : true,
          fechaCompletada: (String(fase) === 'INSTALACION' ? (datos.instalacionCompletada === true) : true) ? new Date() : null,
          datos: JSON.stringify(datosAGuardar),
        },
      });

      if (String(fase) === 'INSTALACION') {
        let instalacionRow = await prisma.proyectoInstalacion.findUnique({
          where: { proyectoId: String(id) },
        });
        if (!instalacionRow) {
          instalacionRow = await prisma.proyectoInstalacion.create({
            data: { proyectoId: String(id) },
          });
        }
        const instUpdate: Record<string, unknown> = {};
        if (datosMerged.fechaInstalacion) {
          instUpdate.fechaInstalacion = new Date(String(datosMerged.fechaInstalacion));
        }
        if (datosMerged.direccionInstalacion !== undefined) {
          instUpdate.direccionInstalacion = String(datosMerged.direccionInstalacion || '');
        }
        if (datosMerged.instalacionCompletada !== undefined) {
          instUpdate.instalacionCompletada = Boolean(datosMerged.instalacionCompletada);
        }
        if (datosMerged.notasCierre !== undefined) {
          instUpdate.notasCierre = String(datosMerged.notasCierre || '');
        }
        if (Object.keys(instUpdate).length > 0) {
          await prisma.proyectoInstalacion.update({
            where: { id: instalacionRow.id },
            data: instUpdate,
          });
        }
      }

      // Actualizar fase actual del proyecto y su progreso
      await prisma.proyecto.update({
        where: { id: String(id) },
        data: { 
          faseActual: String(fase),
          progreso: PROGRESO_POR_FASE[String(fase)] ?? 0
        },
      });

      // Si es la fase de DISEÑO y tiene fecha de aprobación, enviar notificación a Taller
      if (fase === 'DISEÑO' && datos.fechaAprobacionDiseno) {
        try {
          await sendPushToRole('taller', {
            title: '🎨 Diseño Aprobado - Listo para Impresión',
            body: `El diseño del proyecto "${proyecto?.nombre || id}" ha sido aprobado y está listo para imprimir.`,
            icon: '/LogoGlobo.png',
            badge: '/LogoGlobo.png',
            data: {
              url: '/impresiones',
              action: 'view_design',
              proyectoId: id,
            },
          });
          console.log(`[Proyecto ${id}] Notificación de diseño aprobado enviada al taller`);
        } catch (notifError) {
          console.error('[Proyecto] Error sending push notification:', notifError);
          // No fallar la operación si falla la notificación
        }
      }

      // Si es la fase de INSTALACION y se inicia (se registra fechaInstalacion y horaInstalacion por primera vez),
      // enviar notificación push de inicio de instalación
      const seIniciaInstalacion = 
        fase === 'INSTALACION' && 
        datos.fechaInstalacion && 
        datos.horaInstalacion && 
        (!datosInstalacionAnterior.fechaInstalacion || !datosInstalacionAnterior.horaInstalacion);

      if (seIniciaInstalacion) {
        try {
          const payload = {
            title: 'Instalación Iniciada',
            body: `El equipo técnico ha iniciado la instalación en sitio para el proyecto "${proyecto?.nombre || id}".`,
            icon: '/LogoGlobo.png',
            badge: '/LogoGlobo.png',
            data: {
              url: `/proyectos/${id}`,
              action: 'view_project',
              proyectoId: id,
            },
          };
          // UNA sola notificación para admin (expandRoleAliases cubre 'administrador' en la query)
          await prisma.notification.create({
            data: {
              title: payload.title,
              message: payload.body,
              rol: 'admin',
              createdBy: 'Taller',
            },
          });
          await sendPushToRole('admin', payload);
          console.log(`[Proyecto ${id}] Notificación de instalación iniciada enviada a administradores`);
        } catch (notifError) {
          console.error('[Proyecto] Error sending push notification for started installation:', notifError);
        }
      }

      // Si es la fase de INSTALACION y se marca como completada, enviar notificación a Administradores
      const seCompletaInstalacion =
        fase === 'INSTALACION' &&
        datos.instalacionCompletada === true &&
        datosInstalacionAnterior.instalacionCompletada !== true;

      if (seCompletaInstalacion) {
        try {
          const payload = {
            title: 'Instalación Completada',
            body: `La instalación del proyecto "${proyecto?.nombre || id}" ha sido completada en el sitio.`,
            icon: '/LogoGlobo.png',
            badge: '/LogoGlobo.png',
            data: {
              url: `/proyectos/${id}`,
              action: 'view_project',
              proyectoId: id,
            },
          };
          // UNA sola notificación para admin (expandRoleAliases cubre 'administrador' en la query)
          await prisma.notification.create({
            data: {
              title: payload.title,
              message: payload.body,
              rol: 'admin',
              createdBy: 'Taller',
            },
          });
          await sendPushToRole('admin', payload);
          console.log(`[Proyecto ${id}] Notificación de instalación completada enviada a administradores`);
        } catch (notifError) {
          console.error('[Proyecto] Error sending push notification for completed installation:', notifError);
        }
      }

      const proyectoActualizado = await prisma.proyecto.findUnique({
        where: { id: String(id) },
        include: proyectoInclude,
      });

      return res.status(200).json({ success: true, data: mapProyecto(proyectoActualizado!) });
    } catch (error) {
      console.error('[proyectos/avanzarFase]', error);
      return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al avanzar fase' } });
    }
  }

  async updateInstalacion(req: Request, res: Response): Promise<Response> {
    try {
      const { id } = req.params;
      const b = req.body || {};

      // Buscar o crear instalación
      let instalacion = await prisma.proyectoInstalacion.findUnique({
        where: { proyectoId: String(id) },
      });

      if (!instalacion) {
        instalacion = await prisma.proyectoInstalacion.create({
          data: { proyectoId: String(id) },
        });
      }

      // Actualizar datos de instalación
      const updateData: any = {};
      if (b.fechaInstalacion !== undefined) {
        updateData.fechaInstalacion = b.fechaInstalacion ? new Date(b.fechaInstalacion) : null;
      }
      if (b.direccionInstalacion !== undefined) updateData.direccionInstalacion = b.direccionInstalacion;
      if (b.notas !== undefined) updateData.notas = b.notas;
      if (b.instalacionCompletada !== undefined) updateData.instalacionCompletada = Boolean(b.instalacionCompletada);
      if (b.notasCierre !== undefined) updateData.notasCierre = b.notasCierre;

      await prisma.proyectoInstalacion.update({
        where: { id: instalacion.id },
        data: updateData,
      });

      // Actualizar personal asignado
      if (Array.isArray(b.personalAsignado)) {
        await prisma.proyectoInstalacionPersonal.deleteMany({
          where: { instalacionId: instalacion.id },
        });
        for (const p of b.personalAsignado) {
          await prisma.proyectoInstalacionPersonal.create({
            data: {
              instalacionId: instalacion.id,
              empleadoId: p.empleadoId,
              rol: p.rol || '',
            },
          });
        }
      }

      // Actualizar materiales
      if (Array.isArray(b.materiales)) {
        await prisma.proyectoInstalacionMaterial.deleteMany({
          where: { instalacionId: instalacion.id },
        });
        for (const m of b.materiales) {
          await prisma.proyectoInstalacionMaterial.create({
            data: {
              instalacionId: instalacion.id,
              nombre: m.nombre || '',
              cantidad: Number(m.cantidad) || 0,
              unidad: m.unidad || '',
              observacion: m.observacion || '',
            },
          });
        }
      }

      const proyecto = await prisma.proyecto.findUnique({
        where: { id: String(id) },
        include: proyectoInclude,
      });

      return res.status(200).json({ success: true, data: mapProyecto(proyecto!) });
    } catch (error) {
      console.error('[proyectos/updateInstalacion]', error);
      return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al actualizar instalación' } });
    }
  }

  async uploadArchivoDiseno(req: Request, res: Response): Promise<Response> {
    try {
      const { id } = req.params;
      const file = req.file;

      if (!file) {
        return res.status(400).json({
          success: false,
          error: { code: 'NO_FILE', message: 'No se proporcionó archivo' },
        });
      }

      // Verificar que el proyecto existe
      const proyecto = await prisma.proyecto.findUnique({
        where: { id: String(id) },
      });

      if (!proyecto) {
        // Eliminar el archivo subido si el proyecto no existe
        await fs.unlink(file.path).catch(() => {});
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Proyecto no encontrado' },
        });
      }

      // Construir la URL del archivo
      const archivoUrl = `/uploads/proyectos/${id}/${file.filename}`;

      // Obtener datos existentes de la fase de diseño
      const faseDisenoExistente = await prisma.proyectoFase.findUnique({
        where: {
          proyectoId_fase: {
            proyectoId: String(id),
            fase: 'DISEÑO',
          },
        },
      });

      const datosExistentes = parseFaseDatos(faseDisenoExistente?.datos);

      const previewDataUrl = await buildImagePreviewDataUrl(file.path, file.mimetype);

      const nuevoArchivo = {
        name: file.originalname,
        size: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
        type: file.mimetype,
        url: archivoUrl,
        ...(previewDataUrl ? { previewDataUrl } : {}),
      };

      // Obtener arreglo de archivos actuales
      let archivosArte: any[] = [];
      if (Array.isArray(datosExistentes.archivosArte)) {
        archivosArte = [...datosExistentes.archivosArte];
      } else if (datosExistentes.archivoArte) {
        archivosArte = [datosExistentes.archivoArte];
      }

      // Evitar duplicar el mismo archivo por URL
      if (!archivosArte.some(f => f.url === archivoUrl)) {
        archivosArte.push(nuevoArchivo);
      }

      const datosActualizados = {
        ...datosExistentes,
        archivosArte,
        archivoArte: archivosArte[0] || null,
      };

      // Guardar en la fase de diseño
      await prisma.proyectoFase.upsert({
        where: {
          proyectoId_fase: {
            proyectoId: String(id),
            fase: 'DISEÑO',
          },
        },
        update: {
          datos: JSON.stringify(datosActualizados),
        },
        create: {
          proyectoId: String(id),
          fase: 'DISEÑO',
          completada: false,
          datos: JSON.stringify(datosActualizados),
        },
      });

      return res.status(200).json({
        success: true,
        data: {
          name: nuevoArchivo.name,
          size: nuevoArchivo.size,
          type: nuevoArchivo.type,
          url: nuevoArchivo.url,
          ...(previewDataUrl ? { previewDataUrl } : {}),
        },
      });
    } catch (error) {
      console.error('[proyectos/uploadArchivoDiseno]', error);
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Error al subir archivo' },
      });
    }
  }

  /** Sirve archivos de proyecto (diseño / evidencias) vía API — accesible sin JWT. */
  async serveArchivoProyecto(req: Request, res: Response): Promise<Response | void> {
    try {
      const proyectoId = String(req.params.id);
      const safeName = path.basename(decodeURIComponent(String(req.params.filename || '')));
      if (!safeName || safeName === '.' || safeName === '..') {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_INPUT', message: 'Nombre de archivo inválido' },
        });
      }

      const allowedDir = path.resolve(path.join(PROYECTOS_UPLOADS_ROOT, proyectoId));
      const filePath = path.resolve(path.join(allowedDir, safeName));
      const relative = path.relative(allowedDir, filePath);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Ruta no permitida' },
        });
      }

      await fs.access(filePath);
      return res.sendFile(filePath);
    } catch {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Archivo no encontrado' },
      });
    }
  }

  /** Sube evidencia fotográfica de instalación (archivo en disco + referencia en fase). */
  async uploadEvidenciaInstalacion(req: Request, res: Response): Promise<Response> {
    try {
      const { id } = req.params;
      const file = req.file;

      if (!file) {
        return res.status(400).json({
          success: false,
          error: { code: 'NO_FILE', message: 'No se proporcionó imagen' },
        });
      }

      const proyecto = await prisma.proyecto.findUnique({ where: { id: String(id) } });
      if (!proyecto) {
        await fs.unlink(file.path).catch(() => {});
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Proyecto no encontrado' },
        });
      }

      const archivoUrl = `/uploads/proyectos/${id}/${file.filename}`;
      const previewDataUrl = await buildImagePreviewDataUrl(file.path, file.mimetype);
      const evidencia = {
        url: archivoUrl,
        name: file.originalname,
        type: file.mimetype,
        ...(previewDataUrl ? { previewDataUrl } : {}),
      };

      const faseInst = await prisma.proyectoFase.findUnique({
        where: {
          proyectoId_fase: { proyectoId: String(id), fase: 'INSTALACION' },
        },
      });

      const datosPrevios = parseFaseDatos(faseInst?.datos);
      const evidenciasPrevias = Array.isArray(datosPrevios.evidencias) ? [...datosPrevios.evidencias] : [];
      evidenciasPrevias.push(evidencia);

      const datosActualizados = {
        ...datosPrevios,
        evidencias: evidenciasPrevias,
      };

      await prisma.proyectoFase.upsert({
        where: {
          proyectoId_fase: { proyectoId: String(id), fase: 'INSTALACION' },
        },
        update: { datos: JSON.stringify(datosActualizados) },
        create: {
          proyectoId: String(id),
          fase: 'INSTALACION',
          completada: false,
          datos: JSON.stringify(datosActualizados),
        },
      });

      const proyectoActualizado = await prisma.proyecto.findUnique({
        where: { id: String(id) },
        include: proyectoInclude,
      });

      return res.status(200).json({
        success: true,
        data: {
          evidencia,
          evidencias: evidenciasPrevias,
          proyecto: mapProyecto(proyectoActualizado!),
        },
      });
    } catch (error) {
      console.error('[proyectos/uploadEvidenciaInstalacion]', error);
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Error al subir evidencia' },
      });
    }
  }

  /** Contexto público para el formulario de encuesta del cliente */
  async getEncuesta(req: Request, res: Response): Promise<Response> {
    try {
      const { id } = req.params;
      const proyecto = await prisma.proyecto.findUnique({
        where: { id: String(id) },
        include: proyectoInclude,
      });

      if (!proyecto) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Proyecto no encontrado' },
        });
      }

      const requiereInstalacion = proyecto.requiereInstalacion === true;
      const targetFaseName = requiereInstalacion ? 'INSTALACION' : 'COMPLETADO';
      const faseTarget = proyecto.fases?.find((f) => f.fase === targetFaseName);
      const datosTarget = parseFaseDatos(faseTarget?.datos) || {};
      const encuesta = datosTarget.encuestaSatisfaccion as Record<string, unknown> | undefined;
      const instalacionCompletada = !requiereInstalacion
        || datosTarget.instalacionCompletada === true
        || proyecto.instalacion?.instalacionCompletada === true;

      return res.status(200).json({
        success: true,
        data: {
          id: proyecto.id,
          nombre: proyecto.nombre,
          clienteNombre: proyecto.clienteNombre || 'Cliente',
          instalacionCompletada,
          encuestaCompletada: encuesta?.completada === true,
          encuesta: encuesta?.completada === true ? encuesta : null,
          personal: await getPersonalEncuesta(proyecto.id, datosTarget, proyecto.instalacion),
        },
      });
    } catch (error) {
      console.error('[encuesta/get]', error);
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Error al cargar encuesta' },
      });
    }
  }

  /** Guardar respuesta de encuesta del cliente (sin autenticación) */
  async submitEncuesta(req: Request, res: Response): Promise<Response> {
    try {
      const { id } = req.params;
      const body = req.body || {};
      const calificacionGeneral = Number(body.calificacionGeneral);
      const comentarios = String(body.comentarios || '').trim();
      const calificacionesPersonal = Array.isArray(body.personal) ? body.personal : [];

      if (!Number.isFinite(calificacionGeneral) || calificacionGeneral < 1 || calificacionGeneral > 5) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_RATING', message: 'La calificación general debe ser entre 1 y 5' },
        });
      }

      const proyecto = await prisma.proyecto.findUnique({
        where: { id: String(id) },
        include: proyectoInclude,
      });

      if (!proyecto) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Proyecto no encontrado' },
        });
      }

      const requiereInstalacion = proyecto.requiereInstalacion === true;
      const targetFaseName = requiereInstalacion ? 'INSTALACION' : 'COMPLETADO';

      const faseTarget = proyecto.fases?.find((f) => f.fase === targetFaseName);
      const datosTarget = parseFaseDatos(faseTarget?.datos) || {};
      const encuestaAnterior = datosTarget.encuestaSatisfaccion as Record<string, unknown> | undefined;

      if (encuestaAnterior?.completada === true) {
        return res.status(400).json({
          success: false,
          error: { code: 'ALREADY_SUBMITTED', message: 'La encuesta ya fue respondida' },
        });
      }

      const instalacionCompletada = !requiereInstalacion
        || datosTarget.instalacionCompletada === true
        || proyecto.instalacion?.instalacionCompletada === true;

      if (!instalacionCompletada) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INSTALLATION_PENDING',
            message: 'La instalación aún no ha sido completada en obra',
          },
        });
      }

      const personalBase = await getPersonalEncuesta(proyecto.id, datosTarget, proyecto.instalacion);
      const personalCalificado = personalBase.map((p) => {
        const encontrado = calificacionesPersonal.find(
          (c: Record<string, unknown>) => {
            const candidatoId = String(c.empleadoId || c.id || '');
            return candidatoId === p.empleadoId || candidatoId === p.id;
          },
        );
        const estrellasEnviadas = Number(encontrado?.estrellas);
        const estrellasValidas = Number.isFinite(estrellasEnviadas)
          && estrellasEnviadas >= 1
          && estrellasEnviadas <= 5
          ? estrellasEnviadas
          : calificacionGeneral;
        return {
          empleadoId: p.empleadoId,
          nombre: p.nombre,
          rol: p.rol,
          estrellas: estrellasValidas,
        };
      });

      const fechaRespuesta = new Date().toISOString();
      const encuestaSatisfaccion = {
        completada: true,
        fecha: fechaRespuesta.split('T')[0],
        fechaRespuesta,
        calificacionGeneral,
        comentarios,
        personal: personalCalificado,
      };

      const datosActualizados = {
        ...datosTarget,
        encuestaSatisfaccion,
      };

      await prisma.proyectoFase.upsert({
        where: {
          proyectoId_fase: {
            proyectoId: String(id),
            fase: targetFaseName,
          },
        },
        update: {
          datos: JSON.stringify(datosActualizados),
        },
        create: {
          proyectoId: String(id),
          fase: targetFaseName,
          completada: true,
          fechaCompletada: new Date(),
          datos: JSON.stringify(datosActualizados),
        },
      });

      try {
        const payload = {
          title: '⭐ Nueva encuesta de satisfacción',
          body: `El cliente calificó el proyecto "${proyecto.nombre}" con ${calificacionGeneral}/5 estrellas.`,
          icon: '/LogoGlobo.png',
          badge: '/LogoGlobo.png',
          data: {
            url: `/proyectos/${proyecto.id}`,
            action: 'view_project',
            proyectoId: proyecto.id,
          },
        };
        await sendPushToRole('admin', payload);
        await sendPushToRole('administrador', payload);
      } catch (notifError) {
        console.error('[encuesta/submit] Error enviando notificación:', notifError);
      }

      return res.status(200).json({
        success: true,
        data: encuestaSatisfaccion,
      });
    } catch (error) {
      console.error('[encuesta/submit]', error);
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Error al guardar encuesta' },
      });
    }
  }
}
