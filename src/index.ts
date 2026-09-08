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
import { ProyectosController } from './features/proyectos/infrastructure/adapters/http/proyectosController.js';
import { createImpresionesModule } from './features/impresiones/infrastructure/composition/impresionesContainer.js';
import { createGastosModule } from './features/gastos/infrastructure/composition/gastosContainer.js';
import { createLandingRoutes } from './features/landing/infrastructure/routes/landingRoutes.js';




async function bootstrap() {
  // El arranque no ejecuta migraciones ni reparaciones de datos históricos.
  const app = express();


  app.use(cors({ origin: env.corsOrigin }));
  app.use(express.json({ limit: '50mb' }));

  // Servir /uploads con soporte de miniaturas WebP (?thumb=1)
  // Esta ruta ya es proxied por Nginx al backend, es el canal más confiable
  const uploadsRoot = path.resolve('uploads');
  const { ensureThumbFor } = await import('./shared/adapters/http/mediaThumbnailController.js');
  const fsSync = await import('fs');
  app.use('/uploads', async (req, res, next) => {
    try {
      const isThumb = req.query.thumb === '1' || req.query.thumbnail === 'true';
      const isImage = /\.(jpe?g|png|webp|gif)$/i.test(req.path);
      if (!isThumb || !isImage) return next();

      const safePath = path.join(uploadsRoot, req.path.replace(/\.\./g, ''));
      if (!fsSync.existsSync(safePath)) return next();

      const { thumbPath, mime } = await ensureThumbFor(safePath);
      res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
      res.type(mime);
      res.sendFile(thumbPath);
    } catch {
      next();
    }
  });
  app.use('/uploads', express.static(uploadsRoot));

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

  // Archivos de proyecto (diseño / evidencias): público, sin JWT — <img> no envía Authorization
  const proyectosArchivosController = new ProyectosController();
  app.get('/api/proyectos/:id/archivos/:filename', (req, res) =>
    proyectosArchivosController.serveArchivoProyecto(req, res),
  );

  // Endpoint de miniaturas estáticas optimizadas
  const { serveMediaThumbnail } = await import('./shared/adapters/http/mediaThumbnailController.js');
  app.get('/api/media/thumbnail', serveMediaThumbnail);

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

    // Iniciar temporizador para cobro de cheques posfechados programados
    try {
      import('./shared/services/chequesSchedulerService.js').then(({ startChequesScheduler }) => {
        startChequesScheduler();
        console.log('[Bootstrap] Servicio de Cheques Posfechados iniciado.');
      });
    } catch (err) {
      console.error('[Bootstrap] Error al iniciar cheques scheduler:', err);
    }
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
