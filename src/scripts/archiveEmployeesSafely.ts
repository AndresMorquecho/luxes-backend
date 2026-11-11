import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { archiveEmployee } from '../shared/services/employeeArchiveService.js';
import { captureEmployeeHistory, assertHistoryUnchanged } from '../shared/services/employeeArchiveAudit.js';

// Explicit URL only; never silently select .env or a different company.
const url = process.env.ARCHIVE_DATABASE_URL;
if (!url) throw new Error('ARCHIVE_DATABASE_URL is required');
const target = new URL(url);
const apply = process.argv.includes('--apply');
const expectedDb = process.env.ARCHIVE_EXPECTED_DATABASE;
if (!expectedDb || target.pathname !== '/' + expectedDb) throw new Error('Database identity mismatch');
const targets: Array<{id: string; name: string}> = JSON.parse(process.env.ARCHIVE_TARGETS || '[]');
if (!targets.length || targets.some(t => !t.id || !t.name)) throw new Error('Explicit employee IDs and expected names are required');
const output = process.env.ARCHIVE_AUDIT_DIR;
if (!output || !path.isAbsolute(output)) throw new Error('An absolute audit directory is required');
fs.mkdirSync(output, { recursive: true });
const db = new PrismaClient({ datasources: { db: { url } }, log: [] });
const snapshot = () => db.$transaction(async tx => {
  await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
  await tx.$executeRawUnsafe('SET LOCAL statement_timeout = 10000');
  return captureEmployeeHistory(tx, targets.map(t => t.id));
}, { isolationLevel: 'RepeatableRead', timeout: 20000 });
try {
  const before = await snapshot();
  if (before.identities.length !== targets.length) throw new Error('Missing employee');
  for (const t of targets) {
    const e = before.identities.find(e => e.id === t.id);
    if (!e || !e.nombre.toUpperCase().includes(t.name.toUpperCase()) || !e.user_id) throw new Error('Employee identity mismatch: ' + t.id);
  }
  const stamp = new Date().toISOString().replaceAll(':', '-');
  fs.writeFileSync(path.join(output, `${stamp}-before.json`), JSON.stringify(before, null, 2));
  if (apply) {
    const after = await db.$transaction(async tx => {
      await tx.$executeRawUnsafe('SET LOCAL lock_timeout = 3000');
      await tx.$executeRawUnsafe('SET LOCAL statement_timeout = 10000');
      for (const t of targets) await archiveEmployee({
        empleadoId: t.id,
        motivo: 'Salida de la empresa. Baja autorizada por el propietario; fecha de aplicación e historial conservado.',
        actor: { nombre: 'Mantenimiento autorizado por el propietario (Codex)' },
      }, tx);
      const verified = await captureEmployeeHistory(tx, targets.map(t => t.id));
      assertHistoryUnchanged(before, verified);
      if (verified.identities.some(e => !e.archived_at || !e.user_archived_at || e.estado !== 'inactivo')) throw new Error('Incomplete archive');
      return verified;
    }, { isolationLevel: 'Serializable', timeout: 30000 });
    fs.writeFileSync(path.join(output, `${stamp}-after.json`), JSON.stringify(after, null, 2));
    console.log(JSON.stringify({ database: expectedDb, archived: after.identities.map(e => ({ id: e.id, nombre: e.nombre, fechaBaja: e.fecha_baja })), historyUnchanged: true, checkedRelationships: after.relations.length }));
  } else {
    console.log(JSON.stringify({ database: expectedDb, dryRun: true, employees: before.identities.map(e => ({ id: e.id, nombre: e.nombre, estado: e.estado })), checkedRelationships: before.relations.length }));
  }
} finally { await db.$disconnect(); }
