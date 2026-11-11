import { Prisma } from '@prisma/client';

const identifier = (s: string) => Prisma.raw('"' + s.replaceAll('"', '""') + '"');

/** Read-only fingerprints of every FK reference to these identities, including future modules. */
export async function captureEmployeeHistory(tx: Prisma.TransactionClient, ids: string[]) {
  const identities = await tx.$queryRaw<any[]>(Prisma.sql`
    SELECT e.id, e.nombre, u.id AS user_id, u.nombre AS user_nombre, u.estado,
      e.archived_at, e.fecha_baja, u.archived_at AS user_archived_at,
      md5((to_jsonb(e) - ARRAY['archived_at','fecha_baja','updated_at','auto_asistencia'])::text) AS employee_hash,
      md5((to_jsonb(u) - ARRAY['archived_at','estado'])::text) AS user_hash
    FROM empleados e LEFT JOIN users u ON u.empleado_id=e.id
    WHERE e.id IN (${Prisma.join(ids)}) ORDER BY e.id`);
  const fks = await tx.$queryRaw<any[]>`
    SELECT n.nspname AS schema_name, r.relname AS child_table, p.relname AS parent_table,
      a.attname AS child_column, cardinality(c.conkey) AS key_count
    FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace JOIN pg_class p ON p.oid=c.confrelid
    JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
    WHERE c.contype='f' AND c.confrelid IN ('public.users'::regclass,'public.empleados'::regclass)
      AND r.relname <> 'users'
    ORDER BY p.relname,r.relname,a.attname`;
  if (fks.some(f => f.key_count !== 1)) throw new Error('Composite relationship requires manual review');
  const queries = fks.map(f => Prisma.sql`
    SELECT t.id AS empleado_id, ${f.child_table}::text AS tabla, ${f.child_column}::text AS columna,
      count(c.${identifier(f.child_column)})::int AS registros,
      md5(coalesce(string_agg(to_jsonb(c)::text, E'\n' ORDER BY to_jsonb(c)::text)
        FILTER (WHERE c.${identifier(f.child_column)} IS NOT NULL), '')) AS fingerprint
    FROM targets t LEFT JOIN ${identifier(f.schema_name)}.${identifier(f.child_table)} c
      ON c.${identifier(f.child_column)} = ${Prisma.raw(f.parent_table === 'users' ? 't.user_id' : 't.id')}
    GROUP BY t.id`);
  const relations = await tx.$queryRaw<any[]>(Prisma.sql`
    WITH targets AS (SELECT e.id,u.id AS user_id FROM empleados e LEFT JOIN users u ON u.empleado_id=e.id WHERE e.id IN (${Prisma.join(ids)}))
    SELECT * FROM (${Prisma.join(queries, ' UNION ALL ')}) refs ORDER BY empleado_id,tabla,columna`);
  return { identities, relations };
}

export function assertHistoryUnchanged(before: Awaited<ReturnType<typeof captureEmployeeHistory>>, after: Awaited<ReturnType<typeof captureEmployeeHistory>>) {
  if (JSON.stringify(before.relations) !== JSON.stringify(after.relations)) throw new Error('Historical references changed');
  const immutable = (s: typeof before) => s.identities.map(({ id, nombre, user_id, user_nombre, employee_hash, user_hash }) => ({ id, nombre, user_id, user_nombre, employee_hash, user_hash }));
  if (JSON.stringify(immutable(before)) !== JSON.stringify(immutable(after))) throw new Error('Historical identities changed');
}
