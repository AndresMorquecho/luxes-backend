import { prisma } from '../../../../config/prismaClient.js';
// ── Module mapping from URL path ─────────────────────────────────────────────
const MODULE_MAP = {
    auth: 'Usuarios y Roles',
    inventario: 'Inventario',
    compras: 'Compras',
    impresiones: 'Impresión',
    proformas: 'Proformas',
    proyectos: 'Proyectos',
    gastos: 'Gastos',
    vehiculos: 'Vehículos',
    nomina: 'Nómina',
    tareas: 'Tareas',
    empleados: 'Empleados',
    clientes: 'Clientes',
    configuracion: 'Configuración',
    asistencias: 'Asistencia',
    notifications: 'Notificaciones',
    encuesta: 'Encuesta',
};
const ACTION_RULES = [
    // ── Inventario ──
    { method: 'POST', pattern: /^\/api\/inventario\/materiales$/, label: 'Crear material' },
    { method: 'PUT', pattern: /^\/api\/inventario\/materiales\/[^/]+$/, label: 'Editar material' },
    { method: 'DELETE', pattern: /^\/api\/inventario\/materiales\/[^/]+$/, label: 'Eliminar material' },
    { method: 'POST', pattern: /^\/api\/inventario\/materiales\/[^/]+\/movimientos$/, label: 'Registrar movimiento' },
    { method: 'POST', pattern: /^\/api\/inventario\/prestamos$/, label: 'Registrar préstamo' },
    { method: 'PATCH', pattern: /^\/api\/inventario\/prestamos\/[^/]+\/devolver$/, label: 'Devolver préstamo' },
    // ── Compras ──
    { method: 'POST', pattern: /^\/api\/compras$/, label: 'Crear orden de compra' },
    { method: 'PUT', pattern: /^\/api\/compras\/[^/]+$/, label: 'Editar orden de compra' },
    { method: 'PATCH', pattern: /^\/api\/compras\/[^/]+$/, label: 'Actualizar orden de compra' },
    { method: 'DELETE', pattern: /^\/api\/compras\/[^/]+$/, label: 'Eliminar orden de compra' },
    { method: 'POST', pattern: /^\/api\/compras\/[^/]+\/aprobar$/, label: 'Aprobar orden de compra' },
    { method: 'POST', pattern: /^\/api\/compras\/[^/]+\/abonos$/, label: 'Registrar abono a compra' },
    // ── Impresiones ──
    { method: 'POST', pattern: /^\/api\/impresiones$/, label: 'Crear trabajo de impresión' },
    { method: 'PUT', pattern: /^\/api\/impresiones\/[^/]+$/, label: 'Editar trabajo de impresión' },
    { method: 'PATCH', pattern: /^\/api\/impresiones\/[^/]+$/, label: 'Actualizar estado de impresión' },
    { method: 'DELETE', pattern: /^\/api\/impresiones\/[^/]+$/, label: 'Eliminar trabajo de impresión' },
    // ── Proformas ──
    { method: 'POST', pattern: /^\/api\/proformas$/, label: 'Crear proforma' },
    { method: 'PUT', pattern: /^\/api\/proformas\/[^/]+$/, label: 'Editar proforma' },
    { method: 'PATCH', pattern: /^\/api\/proformas\/[^/]+\/estado$/, label: 'Cambiar estado de proforma' },
    { method: 'POST', pattern: /^\/api\/proformas\/[^/]+\/aprobar$/, label: 'Aprobar proforma' },
    { method: 'POST', pattern: /^\/api\/proformas\/[^/]+\/rechazar$/, label: 'Rechazar proforma' },
    { method: 'POST', pattern: /^\/api\/proformas\/[^/]+\/enviar$/, label: 'Enviar proforma' },
    { method: 'POST', pattern: /^\/api\/proformas\/[^/]+\/abonos$/, label: 'Registrar abono a proforma' },
    { method: 'DELETE', pattern: /^\/api\/proformas\/[^/]+$/, label: 'Eliminar proforma' },
    // ── Proyectos ──
    { method: 'POST', pattern: /^\/api\/proyectos$/, label: 'Crear proyecto' },
    { method: 'PUT', pattern: /^\/api\/proyectos\/[^/]+$/, label: 'Editar proyecto' },
    { method: 'PATCH', pattern: /^\/api\/proyectos\/[^/]+$/, label: 'Actualizar proyecto' },
    { method: 'DELETE', pattern: /^\/api\/proyectos\/[^/]+$/, label: 'Eliminar proyecto' },
    { method: 'PATCH', pattern: /^\/api\/proyectos\/[^/]+\/fase$/, label: 'Cambiar fase de proyecto' },
    // ── Gastos ──
    { method: 'POST', pattern: /^\/api\/gastos$/, label: 'Registrar gasto' },
    { method: 'PUT', pattern: /^\/api\/gastos\/[^/]+$/, label: 'Editar gasto' },
    { method: 'DELETE', pattern: /^\/api\/gastos\/[^/]+$/, label: 'Eliminar gasto' },
    // ── Vehículos ──
    { method: 'POST', pattern: /^\/api\/vehiculos$/, label: 'Registrar vehículo' },
    { method: 'PUT', pattern: /^\/api\/vehiculos\/[^/]+$/, label: 'Editar vehículo' },
    // ── Nómina ──
    { method: 'POST', pattern: /^\/api\/nomina\/nominas$/, label: 'Guardar nómina' },
    { method: 'POST', pattern: /^\/api\/nomina\/horas-extras$/, label: 'Registrar horas extra' },
    { method: 'POST', pattern: /^\/api\/nomina\/horas-extras\/[^/]+\/aprobar$/, label: 'Aprobar horas extra' },
    { method: 'POST', pattern: /^\/api\/nomina\/horas-extras\/[^/]+\/rechazar$/, label: 'Rechazar horas extra' },
    { method: 'POST', pattern: /^\/api\/nomina\/vacaciones$/, label: 'Registrar vacaciones' },
    { method: 'POST', pattern: /^\/api\/nomina\/egresos$/, label: 'Registrar egreso de nómina' },
    { method: 'DELETE', pattern: /^\/api\/nomina\/egresos\/[^/]+$/, label: 'Eliminar egreso de nómina' },
    { method: 'POST', pattern: /^\/api\/nomina\/ingresos$/, label: 'Registrar ingreso de nómina' },
    { method: 'DELETE', pattern: /^\/api\/nomina\/ingresos\/[^/]+$/, label: 'Eliminar ingreso de nómina' },
    // ── Tareas ──
    { method: 'POST', pattern: /^\/api\/tareas$/, label: 'Crear tarea' },
    { method: 'PUT', pattern: /^\/api\/tareas\/[^/]+$/, label: 'Editar tarea' },
    { method: 'PATCH', pattern: /^\/api\/tareas\/[^/]+$/, label: 'Actualizar tarea' },
    { method: 'DELETE', pattern: /^\/api\/tareas\/[^/]+$/, label: 'Eliminar tarea' },
    // ── Empleados ──
    { method: 'POST', pattern: /^\/api\/empleados$/, label: 'Crear empleado' },
    { method: 'PUT', pattern: /^\/api\/empleados\/[^/]+$/, label: 'Editar empleado' },
    { method: 'DELETE', pattern: /^\/api\/empleados\/[^/]+$/, label: 'Eliminar empleado' },
    // ── Clientes ──
    { method: 'POST', pattern: /^\/api\/clientes$/, label: 'Crear cliente' },
    { method: 'PUT', pattern: /^\/api\/clientes\/[^/]+$/, label: 'Editar cliente' },
    { method: 'DELETE', pattern: /^\/api\/clientes\/[^/]+$/, label: 'Eliminar cliente' },
    // ── Configuración ──
    { method: 'PUT', pattern: /^\/api\/configuracion/, label: 'Actualizar configuración' },
    { method: 'POST', pattern: /^\/api\/configuracion/, label: 'Guardar configuración' },
    // ── Asistencia ──
    { method: 'POST', pattern: /^\/api\/asistencias/, label: 'Registrar asistencia' },
    // ── Encuesta ──
    { method: 'POST', pattern: /^\/api\/encuesta/, label: 'Enviar encuesta' },
];
// Simple in-memory cache for user names to avoid DB lookups on every request
const userNameCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
async function getUserName(userId) {
    const cached = userNameCache.get(userId);
    if (cached && cached.expiry > Date.now()) {
        return cached.nombre;
    }
    try {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { nombre: true },
        });
        const nombre = user?.nombre || 'Desconocido';
        userNameCache.set(userId, { nombre, expiry: Date.now() + CACHE_TTL_MS });
        return nombre;
    }
    catch {
        return 'Desconocido';
    }
}
function resolveModule(url) {
    // url starts with /api/<module>/...
    const segments = url.replace(/\?.*$/, '').split('/').filter(Boolean);
    // segments: ['api', '<module>', ...]
    const moduleKey = segments[1] || '';
    return MODULE_MAP[moduleKey] || moduleKey || 'Sistema';
}
function resolveAction(method, url, body) {
    const cleanUrl = url.replace(/\?.*$/, '');
    if (method === 'PATCH' && /^\/api\/proformas\/[^/]+\/estado$/.test(cleanUrl)) {
        const estado = String(body?.estado || '');
        if (estado === 'Aprobada' || estado === 'Pagada')
            return 'Aprobar proforma';
        if (estado === 'Rechazada')
            return 'Rechazar proforma';
        return 'Cambiar estado de proforma';
    }
    for (const rule of ACTION_RULES) {
        if (rule.method === method && rule.pattern.test(cleanUrl)) {
            return rule.label;
        }
    }
    return null;
}
// Methods that represent write operations worth logging
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
// Routes that are auth-module actions (already logged manually in AuthService)
const AUTH_SKIP_PATTERN = /^\/api\/auth\//;
// Routes that should NOT generate audit logs (read-heavy endpoints hit via POST, subscriptions, etc.)
const SKIP_PATTERNS = [
    /^\/api\/notifications\/subscribe$/, // push subscription registration
    /^\/api\/notifications\/vapid-key$/,
    /^\/api\/proformas\/[^/]+\/aprobar$/, // logged explicitly in controller
    /^\/api\/proformas\/[^/]+\/rechazar$/, // logged explicitly in controller
    /^\/api\/proformas\/[^/]+\/estado$/, // logged explicitly in controller
];
/**
 * Middleware de auditoría automática.
 * Intercepta peticiones mutantes exitosas y registra la acción en audit_logs.
 * Se ejecuta DESPUÉS del authMiddleware para tener acceso a req.user.
 */
export function auditMiddleware(req, res, next) {
    // Only audit mutating methods
    if (!MUTATING_METHODS.has(req.method)) {
        return next();
    }
    // Skip auth module routes (they already have manual audit logging)
    if (AUTH_SKIP_PATTERN.test(req.originalUrl || req.url)) {
        return next();
    }
    // Skip specific routes that shouldn't be audited
    const cleanUrl = (req.originalUrl || req.url).replace(/\?.*$/, '');
    for (const pat of SKIP_PATTERNS) {
        if (pat.test(cleanUrl)) {
            return next();
        }
    }
    // Hook into the response finish event to log AFTER success
    const originalEnd = res.end;
    res.end = function (...args) {
        // Only log successful responses (2xx, 3xx)
        if (res.statusCode < 400) {
            const userId = req.user?.id;
            const url = req.originalUrl || req.url;
            const method = req.method;
            const modulo = resolveModule(url);
            const accion = resolveAction(method, url, req.body);
            // Only log if we could resolve a meaningful action
            if (accion && userId) {
                // Fire-and-forget — never block the response
                getUserName(userId)
                    .then((nombre) => prisma.auditLog.create({
                    data: {
                        userId,
                        usuarioNom: nombre,
                        accion,
                        modulo,
                        detalle: buildDetail(method, url, req.body),
                        severidad: method === 'DELETE' ? 'Warning' : 'Info',
                    },
                }))
                    .catch((err) => {
                    console.error('[AuditMiddleware] Error al registrar auditoría:', err?.message || err);
                });
            }
        }
        return originalEnd.apply(this, args);
    };
    return next();
}
/**
 * Build a human-readable detail string from the request.
 */
function buildDetail(method, url, body) {
    const cleanUrl = url.replace(/\?.*$/, '');
    const parts = [`${method} ${cleanUrl}`];
    if (body) {
        // Include relevant body fields without sensitive data
        const safeBody = { ...body };
        delete safeBody.password;
        delete safeBody.passwordHash;
        delete safeBody.token;
        // Pick the most descriptive field for a short summary
        const name = safeBody.nombre || safeBody.name || safeBody.titulo || safeBody.concepto || safeBody.descripcion;
        if (name) {
            parts.push(`"${String(name).substring(0, 80)}"`);
        }
    }
    return parts.join(' — ');
}
