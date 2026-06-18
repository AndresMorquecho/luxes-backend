import type { Request, Response } from 'express';
import { prisma } from '../../../../../config/prismaClient.js';
import path from 'path';
import fs from 'fs/promises';
import { sendPushToRole } from '../../../../../shared/services/pushNotificationService.js';

const PROYECTOS_UPLOADS_ROOT = path.resolve('uploads/proyectos');

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

const toDateStr = (d: Date | null | undefined): string =>
  d ? new Date(d).toISOString().split('T')[0] : '';

const PROGRESO_POR_FASE: Record<string, number> = {
  COTIZACION: 0,
  'DISEÑO': 20,
  PRODUCCION: 40,
  INSTALACION: 70,
  ENTREGA: 90,
  COMPLETADO: 100,
};

const proyectoInclude = {
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

function mapProyecto(p: any) {
  return {
    id: p.id,
    nombre: p.nombre,
    clienteId: p.clienteId,
    cliente: {
      nombre: p.clienteNombre,
      empresa: p.clienteEmpresa,
      telefono: p.clienteTelefono,
      email: p.clienteEmail,
      direccion: p.clienteDireccion,
    },
    responsable: p.responsable,
    requiereInstalacion: p.requiereInstalacion,
    faseActual: p.faseActual,
    progreso: p.progreso,
    prioridad: p.prioridad,
    estado: p.estado,
    montoEstimado: Number(p.montoEstimado),
    fechaCreacion: toDateStr(p.fechaCreacion),
    fechaEntregaEstimada: toDateStr(p.fechaEntregaEstimada),
    fechaCompletado: toDateStr(p.fechaCompletado),
    descripcion: p.descripcion,
    etiquetas: p.etiquetas ? p.etiquetas.split(',').map((t: string) => t.trim()).filter(Boolean) : [],
    notas: p.notas,
    fases: (p.fases || []).reduce((acc: any, f: any) => {
      acc[f.fase] = {
        completada: f.completada,
        fechaCompletada: toDateStr(f.fechaCompletada),
        datos: f.datos ? JSON.parse(f.datos) : {},
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
      const limitNum = Math.max(1, Math.min(100, parseInt(String(limit), 10)));
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
          const rolesToNotify = ['taller', 'admin', 'administrador'];
          for (const roleName of rolesToNotify) {
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
            title: '🛠️ Nuevo Proyecto con Instalación',
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
          await sendPushToRole('administrador', payload);
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
        include: { fases: true },
      });

      // Actualizar o crear la fase
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
          datos: JSON.stringify(datos),
        },
        create: {
          proyectoId: String(id),
          fase: String(fase),
          completada: String(fase) === 'INSTALACION' ? (datos.instalacionCompletada === true) : true,
          fechaCompletada: (String(fase) === 'INSTALACION' ? (datos.instalacionCompletada === true) : true) ? new Date() : null,
          datos: JSON.stringify(datos),
        },
      });

      // Actualizar fase actual del proyecto y su progreso
      await prisma.proyecto.update({
        where: { id: String(id) },
        data: { 
          faseActual: String(fase),
          progreso: PROGRESO_POR_FASE[String(fase)] ?? 0
        },
      });

      // Obtener los datos anteriores de la fase de instalación
      const faseInstalacionAnterior = proyecto?.fases?.find(f => f.fase === 'INSTALACION');
      let datosInstalacionAnterior: any = {};
      if (faseInstalacionAnterior?.datos) {
        try {
          datosInstalacionAnterior = JSON.parse(faseInstalacionAnterior.datos);
        } catch (e) {
          console.error(e);
        }
      }

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
            title: '🚀 Instalación Iniciada',
            body: `El equipo técnico ha iniciado la instalación en sitio para el proyecto "${proyecto?.nombre || id}".`,
            icon: '/LogoGlobo.png',
            badge: '/LogoGlobo.png',
            data: {
              url: `/proyectos/${id}`,
              action: 'view_project',
              proyectoId: id,
            },
          };
          await sendPushToRole('admin', payload);
          await sendPushToRole('administrador', payload);
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
            title: '✅ Instalación Completada',
            body: `La instalación del proyecto "${proyecto?.nombre || id}" ha sido completada en el sitio.`,
            icon: '/LogoGlobo.png',
            badge: '/LogoGlobo.png',
            data: {
              url: `/proyectos/${id}`,
              action: 'view_project',
              proyectoId: id,
            },
          };
          await sendPushToRole('admin', payload);
          await sendPushToRole('administrador', payload);
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

      // Guardar la URL en la fase de diseño
      await prisma.proyectoFase.upsert({
        where: {
          proyectoId_fase: {
            proyectoId: String(id),
            fase: 'DISEÑO',
          },
        },
        update: {
          datos: JSON.stringify({
            archivoArte: {
              name: file.originalname,
              size: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
              type: file.mimetype,
              url: archivoUrl,
            },
          }),
        },
        create: {
          proyectoId: String(id),
          fase: 'DISEÑO',
          completada: false,
          datos: JSON.stringify({
            archivoArte: {
              name: file.originalname,
              size: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
              type: file.mimetype,
              url: archivoUrl,
            },
          }),
        },
      });

      return res.status(200).json({
        success: true,
        data: {
          name: file.originalname,
          size: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
          type: file.mimetype,
          url: archivoUrl,
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
}
