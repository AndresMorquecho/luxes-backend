import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

// This test intentionally mutates its disposable database. Fail before importing application modules.
const target = new URL(process.env.DATABASE_URL || 'postgresql://invalid/invalid');
if (!['127.0.0.1', 'localhost'].includes(target.hostname) || target.pathname !== '/luxes_archive_qa') {
  throw new Error('Integration tests require the isolated local luxes_archive_qa database');
}
const { prisma } = await import('../../config/prismaClient.js');
const { env } = await import('../../config/env.js');
const { archiveEmployee } = await import('../../shared/services/employeeArchiveService.js');
const { assertActiveUsers, assertActiveEmployees } = await import('../../shared/services/activeAssignments.js');
const { createAuthModule } = await import('../../features/auth/infrastructure/composition/authContainer.js');
const { createEmpleadosModule } = await import('../../features/empleados/infrastructure/composition/empleadosContainer.js');
const { createNominaModule } = await import('../../features/nomina/infrastructure/composition/nominaContainer.js');
const { getBalancesReportData } = await import('../../features/gastos/application/balancesReport.js');
const { balancePeriod } = await import('../../features/gastos/application/balanceRules.js');
const { CalendarioService } = await import('../../features/calendario/application/services/CalendarioService.js');

test('safe offboarding preserves the production copy and historical identities', async t => {
  const suffix = randomUUID();
  const admin = await prisma.user.create({ data: { nombre: 'QA administrador', username: `qa-admin-${suffix}`, email: `qa-admin-${suffix}@example.invalid`, rol: 'admin', passwordHash: await bcrypt.hash('qa-password', 4) } });
  const employee = await prisma.empleado.create({ data: { id: `QA-${suffix}`, nombre: 'Autor histórico QA', cedula: suffix, sueldoDiario: 20 } });
  const staff = await prisma.user.create({ data: { nombre: employee.nombre, username: `qa-staff-${suffix}`, email: `qa-staff-${suffix}@example.invalid`, rol: 'visor', empleadoId: employee.id, passwordHash: await bcrypt.hash('qa-password', 4) } });
  const expense = await prisma.gasto.create({ data: { id: randomUUID(), concepto: 'QA histórico', monto: 12.34, fecha: new Date('2026-09-05'), registradoPorUserId: staff.id } });
  await prisma.empleadoDocumento.create({ data: { empleadoId: employee.id, tipo: 'contrato', nombre: 'Contrato conservado', archivoUrl: '/uploads/qa-history.pdf' } });
  const token = (u: typeof admin) => jwt.sign({ sub: u.id, rol: u.rol, email: u.email }, env.jwtSecret, { expiresIn: '1h' });
  const adminToken = token(admin), oldStaffToken = token(staff);
  const app = express(); app.use(express.json());
  app.use('/api/auth', (await createAuthModule()).authRoutes);
  app.use('/api/empleados', (await createEmpleadosModule()).empleadosRoutes);
  app.use('/api/nomina', (await createNominaModule()).nominaRoutes);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  async function request(route: string, method = 'GET', auth = adminToken, body?: unknown) {
    const r = await fetch(base + route, { method, headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, body: await r.json() as any };
  }
  try {
    await t.test('non-admin cannot archive and self-archive is rejected', async () => {
      assert.equal((await request(`/api/empleados/${employee.id}`, 'DELETE', oldStaffToken)).status, 403);
      assert.equal((await request(`/api/auth/users/${admin.id}`, 'DELETE')).status, 400);
      assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })).archivedAt, null);
    });
    await t.test('an audit failure rolls back the account and employee together', async () => {
      await assert.rejects(archiveEmployee({ userId: staff.id, actor: { id: 'qa-nonexistent-actor' } }));
      assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: staff.id } })).estado, 'activo');
      assert.equal((await prisma.empleado.findUniqueOrThrow({ where: { id: employee.id } })).archivedAt, null);
    });
    await t.test('user DELETE archives both identities and preserves the transaction author', async () => {
      assert.equal((await request(`/api/auth/users/${staff.id}`, 'DELETE')).status, 200);
      const historical = await prisma.gasto.findUniqueOrThrow({ where: { id: expense.id }, include: { registradoPor: true } });
      assert.equal(historical.registradoPor?.nombre, 'Autor histórico QA');
      assert.equal(Number(historical.monto), 12.34);
      assert.equal(await prisma.empleadoDocumento.count({ where: { empleadoId: employee.id } }), 1);
      assert.equal((await request(`/api/empleados/${employee.id}`)).body.data.nombre, employee.nombre);
    });
    await t.test('new login, existing JWT and reactivation are blocked', async () => {
      assert.equal((await request('/api/auth/me', 'GET', oldStaffToken)).status, 401);
      assert.notEqual((await request('/api/auth/login', 'POST', '', { username: staff.username, password: 'qa-password' })).status, 200);
      assert.equal((await request(`/api/auth/users/${staff.id}/toggle-status`, 'PUT')).status, 400);
      await assert.rejects(assertActiveUsers([staff.id]));
      await assert.rejects(assertActiveEmployees([employee.id]));
    });
    await t.test('both delete entry points are idempotent and normal lists hide archived staff', async () => {
      const before = await prisma.auditLog.count({ where: { accion: 'Dar de baja' } });
      assert.equal((await request(`/api/empleados/${employee.id}`, 'DELETE')).status, 200);
      assert.equal((await request(`/api/auth/users/${staff.id}`, 'DELETE')).status, 200);
      assert.equal(await prisma.auditLog.count({ where: { accion: 'Dar de baja' } }), before);
      assert.equal((await request('/api/empleados')).body.data.some((e: any) => e.id === employee.id), false);
      assert.equal((await request('/api/empleados?incluirBajas=true')).body.data.some((e: any) => e.id === employee.id), true);
      await assert.rejects(prisma.user.delete({ where: { id: staff.id } }));
      await assert.rejects(prisma.empleado.delete({ where: { id: employee.id } }));
    });
    const ids = ['EMP-003', 'EMP-005', 'EMP-013'];
    const history = async () => ({
      payroll: await prisma.nominaRegistro.findMany({ where: { empleadoId: { in: ids } }, orderBy: { id: 'asc' } }),
      attendance: await prisma.asistencia.findMany({ where: { empleadoId: { in: ids } }, orderBy: { id: 'asc' } }),
      overtime: await prisma.horaExtra.findMany({ where: { colaboradorId: { in: ids } }, orderBy: { id: 'asc' } }),
      expenses: await prisma.egreso.findMany({ where: { empleadoId: { in: ids } }, orderBy: { id: 'asc' } }),
      income: await prisma.ingresoDetalle.findMany({ where: { empleadoId: { in: ids } }, orderBy: { id: 'asc' } }),
    });
    const beforeHistory = JSON.stringify(await history());
    const period = balancePeriod('2026-07-01', '2026-11-30');
    const beforeReport = JSON.stringify(await getBalancesReportData(prisma, period));
    await t.test('employee DELETE on the three copied employees preserves history and balances exactly', async () => {
      for (const id of ids) assert.equal((await request(`/api/empleados/${id}`, 'DELETE')).status, 200);
      assert.equal(JSON.stringify(await history()), beforeHistory);
      assert.equal(JSON.stringify(await getBalancesReportData(prisma, period)), beforeReport);
    });
    await t.test('historical payroll GET does not recalculate archived records; future GET creates none', async () => {
      assert.equal((await request('/api/nomina/nominas?fechaInicio=2026-09-01&fechaFin=2026-09-15')).status, 200);
      assert.equal((await request('/api/nomina/nominas?fechaInicio=2027-01-01&fechaFin=2027-01-15')).status, 200);
      assert.equal(JSON.stringify(await history()), beforeHistory);
      assert.equal(await prisma.nominaRegistro.count({ where: { empleadoId: { in: ids }, fechaInicio: new Date('2027-01-01') } }), 0);
    });
    await t.test('recurring calendar assignments retain past names and exclude future archived staff', async () => {
      const archived = await prisma.empleado.findUniqueOrThrow({ where: { id: employee.id } });
      const start = archived.fechaBaja!;
      const previous = new Date(start.getTime() - 86400000).toISOString().slice(0, 10);
      const next = new Date(start.getTime() + 86400000).toISOString().slice(0, 10);
      const rutina = await prisma.rutina.create({ data: {
        titulo: 'QA historical routine', diasSemana: JSON.stringify(Object.fromEntries([1,2,3,4,5,6,7].map(day => [day, [employee.id]]))),
        asignaciones: { create: { empleadoId: employee.id } },
      } });
      const calendar = new CalendarioService();
      const past = (await calendar.getEventosDelMes(previous.slice(0, 7))).eventos.find(e => e.id === `rutina-${rutina.id}-${previous}`);
      assert.ok(past?.subtitulo?.includes(employee.nombre));
      const future = (await calendar.getEventosDelMes(next.slice(0, 7))).eventos.find(e => e.id === `rutina-${rutina.id}-${next}`);
      assert.equal(future, undefined);
      assert.equal(await prisma.rutinaAsignacion.count({ where: { rutinaId: rutina.id, empleadoId: employee.id } }), 1);
    });
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await prisma.$disconnect();
  }
});
