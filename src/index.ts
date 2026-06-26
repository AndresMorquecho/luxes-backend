import express from 'express';
import cors from 'cors';
import path from 'path';
import { env } from './config/env.js';
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


async function bootstrap() {
  // Asegurar que existe el usuario de asistencia para el quiosco y taller
  try {
    const bcrypt = await import('bcryptjs');
    const passwordHash = await bcrypt.default.hash('123456', 10);
    const { prisma } = await import('./config/prismaClient.js');
    
    await prisma.user.upsert({
      where: { username: 'asistencia' },
      update: {
        rol: 'asistencia',
        passwordHash: passwordHash,
      },
      create: {
        id: 'USR-ASIS-001',
        nombre: 'Asistencia Kiosco',
        email: 'asistencia@luxes.com',
        username: 'asistencia',
        rol: 'asistencia',
        passwordHash: passwordHash,
        estado: 'activo',
      },
    });
    console.log('[Bootstrap] Usuario de asistencia verificado/creado con éxito.');

    await prisma.user.upsert({
      where: { username: 'taller' },
      update: {
        rol: 'Taller',
      },
      create: {
        id: 'USR-TALLER-001',
        nombre: 'Taller Técnico',
        email: 'taller@luxes.com',
        username: 'taller',
        rol: 'Taller',
        passwordHash: passwordHash,
        estado: 'activo',
      },
    });
    console.log('[Bootstrap] Usuario de taller verificado/creado con éxito.');
  } catch (error) {
    console.error('[Bootstrap] Error en bootstrap de usuarios:', error);
  }

  // Sincronizar el progreso de proyectos existentes
  try {
    const { prisma } = await import('./config/prismaClient.js');
    const PROGRESO_POR_FASE: Record<string, number> = {
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
  } catch (error) {
    console.error('[Bootstrap] Error al sincronizar progreso de proyectos:', error);
  }

  const app = express();


  app.use(cors({ origin: env.corsOrigin }));
  app.use(express.json({ limit: '10mb' }));
  app.use('/uploads', express.static(path.resolve('uploads')));

  // Middleware para registrar las peticiones HTTP (ocultando contraseñas)
  app.use((req, _res, next) => {
    const cleanBody = req.body ? { ...req.body } : {};
    if (cleanBody.password) cleanBody.password = '******';
    console.log(`[HTTP] ${req.method} ${req.url}`, Object.keys(cleanBody).length ? cleanBody : '');
    next();
  });

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'luxes-backend' });
  });

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

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `[Error] El puerto ${env.port} ya está en uso. Cambia PORT en .env (por ejemplo 4000) o detén el proceso que lo ocupa.`
      );
    } else {
      console.error('[Error] No se pudo iniciar el servidor:', err);
    }
    process.exit(1);
  });
}

bootstrap().catch((error) => {
  console.error('Error al iniciar el servidor:', error);
  process.exit(1);
});
