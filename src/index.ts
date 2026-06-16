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


async function bootstrap() {
  // Asegurar que existe el usuario de asistencia para el quiosco
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
  } catch (error) {
    console.error('[Bootstrap] Error al crear usuario de asistencia:', error);
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


  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Ruta no encontrada' },
    });
  });

  app.listen(env.port, () => {
    console.log(`Luxes API corriendo en http://localhost:${env.port}`);
    console.log(`Login: POST http://localhost:${env.port}/api/auth/login`);
  });
}

bootstrap().catch((error) => {
  console.error('Error al iniciar el servidor:', error);
  process.exit(1);
});
