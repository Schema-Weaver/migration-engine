const EVENT_TRIGGERS_QUERY = `
SELECT
  e.oid,
  e.evtname AS name,
  pg_catalog.pg_get_userbyid(e.evtowner) AS owner,
  e.evtevent AS event,
  e.evtfoid::regproc::text AS function,
  CASE e.evtenabled
    WHEN 'O' THEN 'ENABLED'
    WHEN 'D' THEN 'DISABLED'
    WHEN 'R' THEN 'REPLICA'
    WHEN 'A' THEN 'ALWAYS'
  END AS enabled,
  e.evttags AS tags,
  pg_catalog.obj_description(e.oid, 'pg_event_trigger') AS comment
FROM pg_catalog.pg_event_trigger e
ORDER BY e.evtname
`;

/**
 * @param {import('pg').Pool} pool
 * @param {number} version
 * @returns {Promise<Array>}
 */
export async function queryEventTriggers(pool, version) {
  if (version < 90300) return [];

  try {
    const result = await pool.query(EVENT_TRIGGERS_QUERY);
    
    return result.rows.map(row => ({
      name: row.name,
      owner: row.owner,
      event: row.event,
      function: row.function,
      enabled: row.enabled,
      tags: row.tags || [],
      comment: row.comment || undefined,
    }));
  } catch (error) {
    return [];
  }
}
