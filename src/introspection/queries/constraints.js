const CONSTRAINTS_QUERY = `
SELECT c.oid,
       n.nspname AS schema,
       c.conname AS name,
       c.contype AS type,
       c.conrelid::regclass::text AS table_ref,
       CASE WHEN c.confrelid != 0 THEN c.confrelid::regclass::text ELSE NULL END AS foreign_table,
       pg_catalog.pg_get_constraintdef(c.oid, true) AS definition,
       c.convalidated AS is_validated,
       c.condeferrable AS deferrable,
       c.condeferred AS initially_deferred,
       c.conkey AS column_indices,
       c.confkey AS foreign_column_indices,
       c.confupdtype AS on_update,
       c.confdeltype AS on_delete,
       c.confmatchtype AS match_type,
       c.coninhcount > 0 AS is_inherited,
       c.conislocal AS is_local,
       c.connoinherit AS no_inherit,
       pg_catalog.col_description(c.oid, 0) AS comment,
       CASE WHEN c.contype = 'x' THEN pg_catalog.pg_get_expr(c.conbin, c.conrelid) ELSE NULL END AS exclusion_expression
FROM pg_catalog.pg_constraint c
JOIN pg_catalog.pg_namespace n ON n.oid = c.connamespace
WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND n.nspname NOT LIKE 'pg_temp_%'
ORDER BY n.nspname, c.conrelid::regclass::text, c.conname
`;

const FK_ACTION_MAP = {
  'a': 'NO ACTION',
  'r': 'RESTRICT',
  'c': 'CASCADE',
  'n': 'SET NULL',
  'd': 'SET DEFAULT',
};

const FK_MATCH_MAP = {
  'f': 'FULL',
  'p': 'PARTIAL',
  's': 'SIMPLE',
};

const CONTYPE_MAP = {
  'p': 'PRIMARY_KEY',
  'u': 'UNIQUE',
  'f': 'FOREIGN_KEY',
  'c': 'CHECK',
  'x': 'EXCLUSION',
  'n': 'NOT_NULL',
};

/**
 * @param {import('pg').Pool} pool
 * @returns {Promise<Array>}
 */
export async function queryConstraints(pool) {
  const result = await pool.query(CONSTRAINTS_QUERY);
  return result.rows.map(row => ({
    ...row,
    type: CONTYPE_MAP[row.type] || row.type,
    on_update: FK_ACTION_MAP[row.on_update] || row.on_update,
    on_delete: FK_ACTION_MAP[row.on_delete] || row.on_delete,
    match_type: FK_MATCH_MAP[row.match_type] || row.match_type,
  }));
}
