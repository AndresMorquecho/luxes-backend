import express from 'express';
import cors from 'cors';
import path from 'path';
import { env } from './config/env.js';
import { auditMiddleware } from './features/auth/infrastructure/middleware/auditMiddleware.js';
import { createAuthModule } from './features/auth/infrastructure/composition/authContainer.js';
import { createInventarioModule } from './features/inventario/infrastructure/composition/inventarioContainer.js';
import { createComprasModule } from './features/compras/infrastructure/composition/comprasContainer.js';
import { createNotificationsModule } from './features/notifications/infrastructure/composition/notificationsContainer.js';
import { createTareasModule } from './features/tareas/infrastructure/composition/tareasContainer.js';
import { createEmpleadosModule } from './features/empleados/infrastructure/composition/empleadosContainer.js';
import { createAsistenciaModule } from './features/asistencia/infrastructure/composition/asistenciaContainer.js';
import { createNominaModule } from './features/nomina/infrastructure/composition/nominaContainer.js';
import { createClientesModule } from './features/clientes/infrastructure/composition/clientesContainer.js';
import { createProformasModule } from './features/proformas/infrastructure/composition/proformasContainer.js';
import { createConfiguracionModule } from './features/configuracion/infrastructure/composition/configuracionContainer.js';
import { createProyectosModule } from './features/proyectos/infrastructure/composition/proyectosContainer.js';
import { createImpresionesModule } from './features/impresiones/infrastructure/composition/impresionesContainer.js';
import { createGastosModule } from './features/gastos/infrastructure/composition/gastosContainer.js';
import { createLandingRoutes } from './features/landing/infrastructure/routes/landingRoutes.js';
async function bootstrap() {
    // Limpieza de rol "asistencia" residual en base de datos si existiera
    try {
        const { prisma } = await import('./config/prismaClient.js');
        const dbRole = await prisma.role.findFirst({
            where: { name: { equals: 'asistencia', mode: 'insensitive' } },
        });
        if (dbRole) {
            console.log(`[Bootstrap] Eliminando rol residual no deseado: ${dbRole.name}`);
            await prisma.role.delete({ where: { id: dbRole.id } });
        }
    }
    catch (error) {
        console.error('[Bootstrap] Error al limpiar rol asistencia:', error);
    }
    // Usuario de kiosco: siempre debe existir en producción (sin resetear contraseña si ya existe)
    try {
        const { prisma } = await import('./config/prismaClient.js');
        const bcrypt = await import('bcryptjs');
        const existing = await prisma.user.findFirst({
            where: { username: { equals: 'asistencia', mode: 'insensitive' } }
        });
        if (existing) {
            await prisma.user.update({
                where: { id: existing.id },
                data: {
                    username: 'asistencia',
                    rol: 'asistencia',
                    roleId: null,
                    estado: 'activo'
                },
            });
            console.log('[Bootstrap] Usuario asistencia verificado.');
        }
        else {
            const passwordHash = await bcrypt.default.hash('123456', 10);
            await prisma.user.create({
                data: {
                    id: 'USR-ASIS-001',
                    nombre: 'Asistencia Kiosco',
                    email: 'asistencia@luxes.com',
                    username: 'asistencia',
                    rol: 'asistencia',
                    roleId: null,
                    estado: 'activo',
                    passwordHash,
                },
            });
            console.log('[Bootstrap] Usuario asistencia creado (asistencia / 123456).');
        }
    }
    catch (error) {
        console.error('[Bootstrap] Error al asegurar usuario asistencia:', error);
    }
    // Asegurar usuarios del sistema (activos + contraseña dev conocida) solo si la tabla está vacía
    try {
        const { prisma } = await import('./config/prismaClient.js');
        const userCount = await prisma.user.count();
        if (userCount === 0) {
            console.log('[Bootstrap] Base de datos de usuarios vacía. Sembrando usuarios del sistema por defecto...');
            const bcrypt = await import('bcryptjs');
            const passwordHash = await bcrypt.default.hash('123456', 10);
            const findRole = (...names) => prisma.role.findFirst({
                where: {
                    OR: names.map((name) => ({
                        name: { equals: name, mode: 'insensitive' },
                    })),
                },
            });
            const systemUsers = [
                {
                    username: 'asistencia',
                    data: {
                        id: 'USR-ASIS-001',
                        nombre: 'Asistencia Kiosco',
                        email: 'asistencia@luxes.com',
                        rol: 'asistencia',
                        roleId: null,
                    },
                },
                {
                    username: 'admin',
                    data: {
                        id: 'USR-001',
                        nombre: 'Andrés Israel',
                        email: 'admin@luxes.com',
                        rol: 'Administrador',
                        roleId: (await findRole('Administrador'))?.id ?? null,
                    },
                },
                {
                    username: 'taller',
                    data: {
                        id: 'USR-TALLER-001',
                        nombre: 'Taller Técnico',
                        email: 'taller@luxes.com',
                        rol: 'Taller',
                        roleId: (await findRole('Taller'))?.id ?? null,
                    },
                },
                {
                    username: 'impresion',
                    data: {
                        id: 'USR-003',
                        nombre: 'Impresor Principal',
                        email: 'impresion@luxes.com',
                        rol: 'Impresión',
                        roleId: (await findRole('Impresión', 'Impresion'))?.id ?? null,
                    },
                },
                {
                    username: 'disenador',
                    data: {
                        id: 'USR-005',
                        nombre: 'Diseñador Creativo',
                        email: 'disenador@luxes.com',
                        rol: 'Ventas / Diseñador',
                        roleId: (await findRole('Ventas / Diseñador', 'Diseñador'))?.id ?? null,
                    },
                },
                {
                    username: 'ventas',
                    data: {
                        id: 'USR-004',
                        nombre: 'Andrés Israel',
                        email: 'ventas@luxes.com',
                        rol: 'Ventas / Diseñador',
                        roleId: (await findRole('Ventas / Diseñador', 'Diseñador'))?.id ?? null,
                    },
                },
            ];
            for (const { username, data } of systemUsers) {
                await prisma.user.upsert({
                    where: { username },
                    update: {
                        rol: data.rol,
                        roleId: data.roleId,
                        estado: 'activo',
                        passwordHash,
                    },
                    create: {
                        ...data,
                        username,
                        passwordHash,
                        estado: 'activo',
                    },
                });
                console.log(`[Bootstrap] Usuario ${username} verificado/corregido con éxito.`);
            }
        }
        else {
            console.log('[Bootstrap] Base de datos de usuarios ya contiene registros. Saltando usuarios por defecto.');
        }
    }
    catch (error) {
        console.error('[Bootstrap] Error en bootstrap de usuarios:', error);
    }
    // Sincronizar el progreso de proyectos existentes
    try {
        const { prisma } = await import('./config/prismaClient.js');
        const PROGRESO_POR_FASE = {
            COTIZACION: 0,
            'DISEÑO': 20,
            PRODUCCION: 40,
            INSTALACION: 70,
            ENTREGA: 90,
            COMPLETADO: 100,
        };
        const proyectos = await prisma.proyecto.findMany({
            select: { id: true, faseActual: true, progreso: true }
        });
        let syncCount = 0;
        for (const p of proyectos) {
            const expectedProgreso = PROGRESO_POR_FASE[p.faseActual] ?? 0;
            if (p.progreso !== expectedProgreso) {
                await prisma.proyecto.update({
                    where: { id: p.id },
                    data: { progreso: expectedProgreso }
                });
                syncCount++;
            }
        }
        if (syncCount > 0) {
            console.log(`[Bootstrap] Sincronizados ${syncCount} proyectos con su progreso correspondiente.`);
        }
    }
    catch (error) {
        console.error('[Bootstrap] Error al sincronizar progreso de proyectos:', error);
    }
    const app = express();
    app.use(cors({ origin: env.corsOrigin }));
    app.use(express.json({ limit: '50mb' }));
    app.use('/uploads', express.static(path.resolve('uploads')));
    // Middleware para registrar las peticiones HTTP (ocultando contraseñas)
    app.use((req, _res, next) => {
        const cleanBody = req.body ? { ...req.body } : {};
        if (cleanBody.password)
            cleanBody.password = '******';
        console.log(`[HTTP] ${req.method} ${req.url}`, Object.keys(cleanBody).length ? cleanBody : '');
        next();
    });
    app.get('/health', (_req, res) => {
        res.json({ status: 'ok', service: 'luxes-backend' });
    });
    // Middleware de auditoría automática — registra acciones mutantes en audit_logs
    app.use('/api', auditMiddleware);
    const { authRoutes } = await createAuthModule();
    app.use('/api/auth', authRoutes);
    const { inventarioRoutes } = await createInventarioModule();
    app.use('/api/inventario', inventarioRoutes);
    const { comprasRoutes } = await createComprasModule();
    app.use('/api/compras', comprasRoutes);
    const { notificationsRoutes } = await createNotificationsModule();
    app.use('/api/notifications', notificationsRoutes);
    const { tareasRoutes } = await createTareasModule();
    app.use('/api/tareas', tareasRoutes);
    const { empleadosRoutes } = await createEmpleadosModule();
    app.use('/api/empleados', empleadosRoutes);
    const { asistenciaRoutes } = await createAsistenciaModule();
    app.use('/api/asistencias', asistenciaRoutes);
    const { nominaRoutes } = await createNominaModule();
    app.use('/api/nomina', nominaRoutes);
    const { clientesRoutes } = await createClientesModule();
    app.use('/api/clientes', clientesRoutes);
    const { proformasRoutes } = await createProformasModule();
    app.use('/api/proformas', proformasRoutes);
    const { configuracionRoutes } = await createConfiguracionModule();
    app.use('/api/configuracion', configuracionRoutes);
    const { proyectosRoutes, encuestaRoutes } = await createProyectosModule();
    app.use('/api/encuesta', encuestaRoutes);
    app.use('/api/proyectos', proyectosRoutes);
    const { impresionesRoutes } = await createImpresionesModule();
    app.use('/api/impresiones', impresionesRoutes);
    const { gastosRouter, vehiculosRouter } = await createGastosModule();
    app.use('/api/gastos', gastosRouter);
    app.use('/api/vehiculos', vehiculosRouter);
    app.use('/api/landing', createLandingRoutes());
    app.use((_req, res) => {
        res.status(404).json({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Ruta no encontrada' },
        });
    });
    const server = app.listen(env.port, () => {
        console.log(`Luxes API corriendo en http://localhost:${env.port}`);
        console.log(`Login: POST http://localhost:${env.port}/api/auth/login`);
    });
    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.error(`[Error] El puerto ${env.port} ya está en uso. Cambia PORT en .env (por ejemplo 4000) o detén el proceso que lo ocupa.`);
        }
        else {
            console.error('[Error] No se pudo iniciar el servidor:', err);
        }
        process.exit(1);
    });
}
bootstrap().catch((error) => {
    console.error('Error al iniciar el servidor:', error);
    process.exit(1);
});
