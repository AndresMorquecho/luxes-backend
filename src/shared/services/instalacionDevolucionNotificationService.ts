import { prisma } from '../../config/prismaClient.js';
import { sendPushToUsers } from './pushNotificationService.js';

type MaterialInstalacion = {
  nombre?: string;
  sku?: string;
  cantidad?: number;
  cantidadLlevada?: number;
  responsable?: string;
  tipo?: string;
  subtipo?: string;
  observacion?: string;
};

type PersonalAsignado = {
  empleadoId?: string;
  nombre?: string;
};

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeSku(value: string): string {
  return value.trim().replace(/\s+/g, '').toUpperCase();
}

function cantidadMaterial(m: MaterialInstalacion): number {
  const raw = m.cantidadLlevada ?? m.cantidad ?? 1;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function esHerramientaRegistro(
  m: MaterialInstalacion,
  material?: { tipo?: string | null; subtipo?: string | null; esPrestable?: boolean | null } | null,
): boolean {
  if (String(m.responsable || '').trim()) return true;
  const tipo = String(m.tipo || '').toLowerCase();
  const subtipo = String(m.subtipo || '').toLowerCase();
  if (tipo === 'herramienta' || subtipo === 'herramienta') return true;
  if (material?.tipo === 'herramienta') return true;
  if (material?.subtipo === 'herramienta') return true;
  if (material?.esPrestable === true) return true;
  return false;
}

async function findMaterial(m: MaterialInstalacion) {
  const sku = String(m.sku || '').trim();
  const nombre = String(m.nombre || '').trim();
  const skuNorm = sku ? normalizeSku(sku) : '';

  if (sku && sku !== 'SIN-CODIGO') {
    const byExactSku = await prisma.material.findFirst({
      where: {
        OR: [
          { codigo: { equals: sku, mode: 'insensitive' } },
          { codigo: sku },
        ],
      },
    });
    if (byExactSku) return byExactSku;

    const candidates = await prisma.material.findMany({
      where: {
        OR: [
          { codigo: { not: null } },
          { nombre: nombre ? { contains: nombre, mode: 'insensitive' } : undefined },
        ],
      },
      take: 200,
    });
    const byNormSku = candidates.find(
      (row) => row.codigo && normalizeSku(row.codigo) === skuNorm,
    );
    if (byNormSku) return byNormSku;
  }

  if (nombre) {
    const byNombre = await prisma.material.findFirst({
      where: { nombre: { equals: nombre, mode: 'insensitive' } },
    });
    if (byNombre) return byNombre;

    return prisma.material.findFirst({
      where: { nombre: { contains: nombre, mode: 'insensitive' } },
    });
  }

  return null;
}

async function resolveUserIdForResponsable(
  responsableNombre: string,
  personalAsignado: PersonalAsignado[],
): Promise<string | null> {
  const nombre = responsableNombre.trim();
  const norm = normalizeName(nombre);
  if (!norm) return null;

  const member = personalAsignado.find(
    (p) => normalizeName(String(p.nombre || '')) === norm,
  ) || personalAsignado.find((p) => {
    const pn = normalizeName(String(p.nombre || ''));
    return pn && (pn.includes(norm) || norm.includes(pn));
  });
  if (member?.empleadoId) {
    const byEmpleado = await prisma.user.findFirst({
      where: { empleadoId: String(member.empleadoId), estado: 'activo' },
      select: { id: true },
    });
    if (byEmpleado) return byEmpleado.id;
  }

  const empleado = await prisma.empleado.findFirst({
    where: { nombre: { equals: nombre, mode: 'insensitive' } },
    select: { id: true, correo: true },
  });
  if (empleado) {
    const byEmpleadoRecord = await prisma.user.findFirst({
      where: {
        estado: 'activo',
        OR: [
          { empleadoId: empleado.id },
          ...(empleado.correo
            ? [{ email: { equals: empleado.correo, mode: 'insensitive' as const } }]
            : []),
        ],
      },
      select: { id: true },
    });
    if (byEmpleadoRecord) return byEmpleadoRecord.id;
  }

  const users = await prisma.user.findMany({
    where: { estado: 'activo' },
    select: { id: true, nombre: true },
  });

  const exact = users.find((u) => normalizeName(u.nombre) === norm);
  if (exact) return exact.id;

  const partial = users.find((u) => {
    const userName = normalizeName(u.nombre);
    return userName.includes(norm) || norm.includes(userName);
  });
  return partial?.id ?? null;
}

async function yaRegistradoParaProyecto(proyectoId: string): Promise<boolean> {
  const tag = `[PROYECTO_ID:${proyectoId}]`;
  const existing = await prisma.prestamo.findFirst({
    where: {
      estado: 'prestado',
      comentarios: { contains: tag },
    },
  });
  return Boolean(existing);
}

function cantidadPorDevolver(tools: MaterialInstalacion[]): number {
  return tools.reduce((sum, tool) => sum + cantidadMaterial(tool), 0);
}

function etiquetaCantidadDevolver(cantidad: number): string {
  if (cantidad === 1) return '1 herramienta por devolver';
  return `${cantidad} herramientas por devolver`;
}

async function tienePrestamoActivo(materialId: string): Promise<boolean> {
  const existing = await prisma.prestamo.findFirst({
    where: { materialId, estado: 'prestado' },
    select: { id: true },
  });
  return Boolean(existing);
}

async function registrarPrestamoDevolucion(
  materialId: string,
  responsableId: string,
  cantidad: number,
  comentarios: string,
  encargadoNombre: string,
) {
  const tagMatch = comentarios.match(/\[PROYECTO_ID:(.+?)\]/);
  const proyectoTag = tagMatch ? `[PROYECTO_ID:${tagMatch[1]}]` : null;

  const prestamoActivo = await prisma.prestamo.findFirst({
    where: { materialId, estado: 'prestado' },
  });
  if (prestamoActivo) {
    console.log(`[instalacionDevolucion] Material ${materialId} ya prestado, no se duplica`);
    return prestamoActivo;
  }

  if (proyectoTag) {
    const existing = await prisma.prestamo.findFirst({
      where: {
        materialId,
        responsableId,
        estado: 'prestado',
        comentarios: { contains: proyectoTag },
      },
    });
    if (existing) return existing;
  }

  const mat = await prisma.material.findUnique({ where: { id: materialId } });
  if (!mat) return null;

  const prestamo = await prisma.prestamo.create({
    data: {
      materialId,
      responsableId,
      cantidad,
      comentarios,
      estado: 'prestado',
    },
  });

  if (mat.stockActual >= cantidad) {
    await prisma.material.update({
      where: { id: materialId },
      data: {
        stockActual: { decrement: cantidad },
        estadoUso: 'EN USO',
        aCargo: encargadoNombre,
      },
    });
  } else {
    await prisma.material.update({
      where: { id: materialId },
      data: {
        estadoUso: 'EN USO',
        aCargo: encargadoNombre,
      },
    });
  }

  return prestamo;
}

async function cargarDatosInstalacion(
  proyectoId: string,
  datosInstalacion: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const materiales = datosInstalacion.materiales;
  const personal = datosInstalacion.personalAsignado;
  if (Array.isArray(materiales) && materiales.length > 0) {
    return datosInstalacion;
  }

  const fase = await prisma.proyectoFase.findUnique({
    where: {
      proyectoId_fase: { proyectoId, fase: 'INSTALACION' },
    },
  });
  if (!fase?.datos) return datosInstalacion;

  try {
    const parsed = JSON.parse(fase.datos) as Record<string, unknown>;
    return {
      ...parsed,
      ...datosInstalacion,
      materiales: Array.isArray(datosInstalacion.materiales) && datosInstalacion.materiales.length
        ? datosInstalacion.materiales
        : parsed.materiales,
      personalAsignado: Array.isArray(datosInstalacion.personalAsignado) && datosInstalacion.personalAsignado.length
        ? datosInstalacion.personalAsignado
        : parsed.personalAsignado,
    };
  } catch {
    return datosInstalacion;
  }
}

/**
 * Al cerrar una instalación, registra préstamos pendientes y notifica a cada encargado
 * de herramienta que debe realizar la devolución.
 */
export async function notificarDevolucionHerramientasInstalacion(params: {
  proyectoId: string;
  proyectoNombre: string;
  datosInstalacion: Record<string, unknown>;
}): Promise<void> {
  if (await yaRegistradoParaProyecto(params.proyectoId)) {
    console.log(`[instalacionDevolucion] Préstamos ya registrados para ${params.proyectoId}`);
    return;
  }

  const datosInstalacion = await cargarDatosInstalacion(
    params.proyectoId,
    params.datosInstalacion,
  );

  const materiales = Array.isArray(datosInstalacion.materiales)
    ? (datosInstalacion.materiales as MaterialInstalacion[])
    : [];
  const personalAsignado = Array.isArray(datosInstalacion.personalAsignado)
    ? (datosInstalacion.personalAsignado as PersonalAsignado[])
    : [];

  const candidatos = materiales.filter((m) => String(m.responsable || '').trim());
  if (candidatos.length === 0) {
    console.log(`[instalacionDevolucion] Sin herramientas con responsable en ${params.proyectoId}`);
    return;
  }

  const herramientas: Array<MaterialInstalacion & { materialId?: string }> = [];
  for (const item of candidatos) {
    const material = await findMaterial(item);
    if (!esHerramientaRegistro(item, material)) {
      console.log(`[instalacionDevolucion] Omitido (no es herramienta): ${item.nombre}`);
      continue;
    }
    if (!material?.id) {
      console.log(`[instalacionDevolucion] Material no encontrado en inventario: ${item.nombre} (${item.sku || 'sin sku'})`);
      continue;
    }
    if (await tienePrestamoActivo(material.id)) {
      console.log(`[instalacionDevolucion] Ya prestada, omitiendo: ${item.nombre}`);
      continue;
    }
    herramientas.push({ ...item, materialId: material.id });
  }

  if (herramientas.length === 0) {
    console.log(`[instalacionDevolucion] Ninguna herramienta válida para ${params.proyectoId}`);
    return;
  }

  const porEncargado = new Map<string, typeof herramientas>();

  for (const h of herramientas) {
    const key = normalizeName(String(h.responsable));
    if (!porEncargado.has(key)) porEncargado.set(key, []);
    porEncargado.get(key)!.push(h);
  }

  for (const tools of porEncargado.values()) {
    const responsableNombre = String(tools[0].responsable || '').trim();
    const userId = await resolveUserIdForResponsable(responsableNombre, personalAsignado);

    if (!userId) {
      console.warn(
        `[instalacionDevolucion] Sin usuario vinculado para "${responsableNombre}", omitiendo préstamo y notificación`,
      );
      continue;
    }

    for (const tool of tools) {
      const qty = cantidadMaterial(tool);

      if (tool.materialId) {
        try {
          await registrarPrestamoDevolucion(
            tool.materialId,
            userId,
            qty,
            `Devolución pendiente tras instalación del proyecto ${params.proyectoNombre} [PROYECTO_ID:${params.proyectoId}]`,
            responsableNombre,
          );
        } catch (err) {
          console.error('[instalacionDevolucion] Error creando préstamo:', err);
        }
      }
    }

    const cantidadDevolver = cantidadPorDevolver(tools);
    const etiquetaCantidad = etiquetaCantidadDevolver(cantidadDevolver);
    const message = `La instalación del proyecto "${params.proyectoNombre}" finalizó. Tienes ${etiquetaCantidad}. [PROYECTO_ID:${params.proyectoId}]`;

    try {
      await prisma.notification.create({
        data: {
          title: etiquetaCantidad,
          message,
          userId,
          createdBy: 'Sistema Luxes',
        },
      });
      await sendPushToUsers([userId], {
        title: etiquetaCantidad,
        body: `Tienes ${etiquetaCantidad} tras el proyecto "${params.proyectoNombre}".`,
        icon: '/LogoGlobo.png',
        badge: '/LogoGlobo.png',
        data: {
          url: '/devoluciones',
          proyectoId: params.proyectoId,
          cantidadDevolver,
        },
      }).catch(() => {});
      console.log(
        `[instalacionDevolucion] ${params.proyectoId} → notificación solo a usuario ${userId} (${responsableNombre})`,
      );
    } catch (err) {
      console.error('[instalacionDevolucion] Error enviando notificación:', err);
    }
  }
}

/** Procesa instalaciones ya completadas que aún no tienen préstamos de devolución. */
export async function sincronizarDevolucionesInstalacionesPendientes(): Promise<number> {
  const fases = await prisma.proyectoFase.findMany({
    where: { fase: 'INSTALACION' },
    include: {
      proyecto: { select: { id: true, nombre: true } },
    },
  });

  let procesados = 0;
  for (const fase of fases) {
    try {
      const datos = fase.datos ? (JSON.parse(fase.datos) as Record<string, unknown>) : {};
      if (datos.instalacionCompletada !== true) continue;
      if (await yaRegistradoParaProyecto(fase.proyectoId)) continue;

      await notificarDevolucionHerramientasInstalacion({
        proyectoId: fase.proyectoId,
        proyectoNombre: fase.proyecto?.nombre || fase.proyectoId,
        datosInstalacion: datos,
      });
      procesados += 1;
    } catch (err) {
      console.error(`[instalacionDevolucion] Error sincronizando ${fase.proyectoId}:`, err);
    }
  }
  return procesados;
}
