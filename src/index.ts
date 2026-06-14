import express from 'express';
import cors from 'cors';
import path from 'path';
import { env } from './config/env.js';
import { createAuthModule } from './features/auth/infrastructure/composition/authContainer.js';
import { createLandingRoutes } from './features/landing/infrastructure/routes/landingRoutes.js';
import { createEmpleadosModule } from './features/empleados/infrastructure/composition/empleadosContainer.js';
import { createNominaModule } from './features/nomina/infrastructure/composition/nominaContainer.js';

async function bootstrap() {
  const app = express();

  app.use(cors({ origin: env.corsOrigin }));
  app.use(express.json({ limit: '10mb' }));

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
  app.use('/api/landing', createLandingRoutes());

  const { empleadosRoutes } = await createEmpleadosModule();
  app.use('/api/empleados', empleadosRoutes);

  const { nominaRoutes } = await createNominaModule();
  app.use('/api/nomina', nominaRoutes);
  app.use('/uploads', express.static(path.resolve('uploads')));

  app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err && typeof err === 'object' && 'type' in err && err.type === 'entity.too.large') {
      return res.status(413).json({
        success: false,
        error: {
          code: 'PAYLOAD_TOO_LARGE',
          message: 'Los datos enviados son demasiado grandes (máx. 10 MB)',
        },
      });
    }
    next(err);
  });

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
