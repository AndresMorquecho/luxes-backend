import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { createAuthModule } from './features/auth/infrastructure/composition/authContainer.js';
import { createInventarioModule } from './features/inventario/infrastructure/composition/inventarioContainer.js';
import { createComprasModule } from './features/compras/infrastructure/composition/comprasContainer.js';
import { createNotificationsModule } from './features/notifications/infrastructure/composition/notificationsContainer.js';
import { createTareasModule } from './features/tareas/infrastructure/composition/tareasContainer.js';
import { createEmpleadosModule } from './features/empleados/infrastructure/composition/empleadosContainer.js';
import { createNominaModule } from './features/nomina/infrastructure/composition/nominaContainer.js';
import { createProformasModule } from './features/proformas/infrastructure/composition/proformasContainer.js';
import { createClientesModule } from './features/clientes/infrastructure/composition/clientesContainer.js';
import { createGastosModule } from './features/gastos/infrastructure/composition/gastosContainer.js';

async function bootstrap() {
  const app = express();

  app.use(cors({ origin: env.corsOrigin }));
  app.use(express.json());

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

  const { nominaRoutes } = await createNominaModule();
  app.use('/api/nomina', nominaRoutes); // vacaciones, nominas, horas-extras

  const { proformasRoutes } = await createProformasModule();
  app.use('/api', proformasRoutes); // proformas

  const { clientesRoutes } = await createClientesModule();
  app.use('/api/clientes', clientesRoutes);

  const { gastosRoutes } = await createGastosModule();
  app.use('/api/gastos', gastosRoutes);

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
