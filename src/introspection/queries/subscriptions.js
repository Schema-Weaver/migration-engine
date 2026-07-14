const SUBSCRIPTIONS_QUERY = `
SELECT
  s.oid,
  s.subname AS name,
  pg_catalog.pg_get_userbyid(s.subowner) AS owner,
  s.subconninfo AS conninfo,
  s.subslotname AS slot_name,
  s.subsynccommit AS sync_commit,
  s.subenabled AS enabled,
  s.subpublications AS publications,
  s.subbinary AS binary_transfer,
  s.substream AS streaming,
  s.subtwophasestate AS two_phase_state,
  CASE WHEN s.subdisableonerr THEN true ELSE false END AS disable_on_error,
  s.suborigin AS origin,
  pg_catalog.obj_description(s.oid, 'pg_subscription') AS comment
FROM pg_catalog.pg_subscription s
ORDER BY s.subname
`;

const SUBSCRIPTION_TABLES_QUERY = `
SELECT
  s.subname AS subscription,
  n.nspname AS table_schema,
  c.relname AS table_name,
  sr.srsubstate AS state
FROM pg_catalog.pg_subscription_rel sr
JOIN pg_catalog.pg_subscription s ON s.oid = sr.srsubid
JOIN pg_catalog.pg_class c ON c.oid = sr.srrelid
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
ORDER BY s.subname, n.nspname, c.relname
`;

/**
 * @param {import('pg').Pool} pool
 * @param {number} version
 * @returns {Promise<Array>}
 */
export async function querySubscriptions(pool, version) {
  if (version < 100000) return [];

  try {
    const subsResult = await pool.query(SUBSCRIPTIONS_QUERY);
    let tablesResult = { rows: [] };
    
    try {
      tablesResult = await pool.query(SUBSCRIPTION_TABLES_QUERY);
    } catch (e) {
      // Table may not exist if no subscription tables
    }

    const subMap = new Map();
    
    for (const row of subsResult.rows) {
      let publications = [];
      if (row.publications && typeof row.publications === 'string') {
        try {
          const parsed = JSON.parse(row.publications);
          publications = Array.isArray(parsed) ? parsed : [parsed];
        } catch {
          publications = row.publications.split(',').map(s => s.trim()).filter(Boolean);
        }
      } else if (Array.isArray(row.publications)) {
        publications = row.publications;
      }

      subMap.set(row.name, {
        name: row.name,
        owner: row.owner,
        conninfo: row.conninfo,
        slot_name: row.slot_name,
        sync_commit: row.sync_commit,
        enabled: row.enabled,
        publications,
        binary_transfer: row.binary_transfer || false,
        streaming: row.streaming || false,
        two_phase: row.two_phase_state && row.two_phase_state !== 'd',
        disable_on_error: row.disable_on_error || false,
        origin: row.origin || 'any',
        comment: row.comment,
        tables: [],
      });
    }

    for (const row of tablesResult.rows) {
      const sub = subMap.get(row.subscription);
      if (sub) {
        sub.tables.push({
          table: `${row.table_schema}.${row.table_name}`,
          state: row.state,
        });
      }
    }

    return Array.from(subMap.values());
  } catch (error) {
    return [];
  }
}
