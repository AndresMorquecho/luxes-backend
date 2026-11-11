import { test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { archiveDate } from '../../shared/services/employeeArchiveService.js';
import { createAuthMiddleware } from '../../features/auth/infrastructure/middleware/authMiddleware.js';
import { env } from '../../config/env.js';

test('offboarding uses the Ecuador calendar date and rejects invalid or future dates', () => {
  const now = new Date('2026-11-12T02:00:00Z');
  assert.equal(archiveDate(undefined, now).toISOString(), '2026-11-11T00:00:00.000Z');
  assert.equal(archiveDate('2026-10-31', now).toISOString().slice(0, 10), '2026-10-31');
  assert.throws(() => archiveDate('2026-02-30', now));
  assert.throws(() => archiveDate('2026-11-12', now));
});

test('session revalidation fails closed without misreporting an outage as an invalid token', async () => {
  const token = jwt.sign({ sub: 'qa-user', rol: 'admin', email: 'qa@example.invalid' }, env.jwtSecret);
  const req = { headers: { authorization: `Bearer ${token}` } };
  let status = 0, next = false;
  const res: any = { status(s: number) { status = s; return this; }, json() { return this; } };
  await createAuthMiddleware(async () => { throw new Error('Database unavailable'); })(req, res, () => { next = true; });
  assert.equal(status, 503);
  assert.equal(next, false);
  await createAuthMiddleware(async () => ({ nombre: 'QA', estado: 'activo', archivedAt: null, empleado: { archivedAt: new Date() } }))(req, res, () => { next = true; });
  assert.equal(status, 401);
  assert.equal(next, false);
});
