const DATABASES_QUERY = `
SELECT
  d.oid,
  d.datname AS name,
  pg_catalog.pg_get_userbyid(d.datdba) AS owner,
  pg_catalog.pg_encoding_to_char(d.encoding) AS encoding,
  d.datcollate AS collate,
  d.datctype AS ctype,
  d.datistemplate AS is_template,
  d.datallowconn AS allow_conn,
  d.datconnlimit AS conn_limit,
  t.spcname AS tablespace,
  pg_catalog.shobj_description(d.oid, 'pg_database') AS comment
FROM pg_catalog.pg_database d
LEFT JOIN pg_catalog.pg_tablespace t ON t.oid = d.dattablespace
WHERE d.datname NOT LIKE 'template%'
ORDER BY d.datname
`;

/**
 * @param {import('pg').Pool} pool
 * @returns {Promise<Array>}
 */
export async function queryInterfaceDatabases(pool) {
  try {
    const result = await pool.query(DATABASES_QUERY);
    
    return result.rows.map(row => ({
      name: row.name,
      owner: row.owner,
      encoding: row.encoding,
      collate: row.collate,
      ctype: row.ctype,
      is_template: row.is_template,
      allow_conn: row.allow_conn,
      conn_limit: row.conn_limit,
      tablespace: row.tablespace,
      comment: row.comment || undefined,
    }));
  } catch (error) {
    return [];
  }
}
