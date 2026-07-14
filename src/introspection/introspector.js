import { detectPgVersion, majorVersion } from './version-detector.js';
import { translateSnapshot } from './translator.js';
import * as queries from './queries/index.js';

const SYSTEM_SCHEMAS = ['pg_catalog', 'information_schema', 'pg_toast'];

export class SchemaIntrospector {
  /** @param {import('pg').Pool} pool */
  constructor(pool) {
    this.pool = pool;
    this.logger = console;
  }

  /**
   * @param {Object} [options]
   * @param {string[]} [options.schemas] - Specific schemas to introspect (default: all user schemas)
   * @returns {Promise<import('../types/schema.js').SchemaSnapshot>}
   */
  async introspect(options = {}) {
    const version = await detectPgVersion(this.pool);
    const pgMajor = majorVersion(version);
    const versionStr = await this.detectVersionString();

    // Resolve target schemas
    const targetSchemas = options.schemas || await this.resolveUserSchemas();

    // Database-level objects (queried once, not per-schema)
    const [
      roles,
      tablespaces,
      accessMethods,
      databases,
      casts,
      proceduralLanguages,
      defaultPrivileges,
      foreignDataWrappers,
      foreignServers,
      userMappings,
      eventTriggers,
      publications,
      subscriptions,
    ] = await Promise.all([
      queries.queryRoles(this.pool).catch(() => []),
      queries.queryInterfaceTablespaces(this.pool).catch(() => []),
      queries.queryInterfaceAccessMethods(this.pool).catch(() => []),
      queries.queryInterfaceDatabases(this.pool).catch(() => []),
      queries.queryCasts(this.pool).catch(() => []),
      queries.queryProceduralLanguages(this.pool).catch(() => []),
      queries.queryDefaultPrivileges(this.pool).catch(() => []),
      queries.queryForeignDataWrappers(this.pool).catch(() => []),
      queries.queryForeignServers(this.pool).catch(() => []),
      queries.queryUserMappings(this.pool).catch(() => []),
      queries.queryEventTriggers(this.pool, version).catch(() => []),
      queries.queryPublications(this.pool, version).catch(() => []),
      queries.querySubscriptions(this.pool, version).catch(() => []),
    ]);

    // Per-schema queries (parallelized)
    const [
      schemasResult,
      tables,
      columns,
      constraints,
      indexes,
      indexColumns,
      functions,
      triggers,
      typesResult,
      viewsResult,
      sequences,
      partitions,
      policies,
      extensions,
      inheritance,
      comments,
      grants,
      statistics,
      collations,
      conversions,
      operators,
      operatorClasses,
      operatorFamilies,
      textSearchConfigs,
      textSearchDictionaries,
      textSearchParsers,
      textSearchTemplates,
      foreignTables,
      multiranges,
      rules,
      aggregates,
      procedures,
      toastOptions,
    ] = await Promise.all([
      queries.querySchemas(this.pool).then(r => r.filter(s => targetSchemas.includes(s.name))).catch(() => []),
      queries.queryTables(this.pool, version).then(r => r.filter(t => targetSchemas.includes(t.schema))).catch(() => []),
      queries.queryColumns(this.pool, version).then(r => r.filter(c => targetSchemas.includes(c.schema))).catch(() => []),
      queries.queryConstraints(this.pool).then(r => r.filter(c => targetSchemas.includes(c.schema))).catch(() => []),
      queries.queryIndexes(this.pool).then(r => r.filter(i => targetSchemas.includes(i.schema))).catch(() => []),
      queries.queryIndexColumns(this.pool).then(r => r.filter(i => targetSchemas.includes(i.schema))).catch(() => []),
      queries.queryFunctions(this.pool).then(r => r.filter(f => targetSchemas.includes(f.schema))).catch(() => []),
      queries.queryTriggers(this.pool).then(r => r.filter(t => targetSchemas.includes(t.schema))).catch(() => []),
      queries.queryTypes(this.pool).then(r => ({
        enums: (r.enums || []).filter(e => targetSchemas.includes(e.schema)),
        composites: (r.composites || []).filter(c => targetSchemas.includes(c.schema)),
        domains: (r.domains || []).filter(d => targetSchemas.includes(d.schema)),
        ranges: (r.ranges || []).filter(r => targetSchemas.includes(r.schema)),
      })).catch(() => ({ enums: [], composites: [], domains: [], ranges: [] })),
      queries.queryViews(this.pool).then(r => r).catch(() => ({ views: [], materializedViews: [] })),
      queries.querySequences(this.pool).then(r => r.filter(s => targetSchemas.includes(s.schema))).catch(() => []),
      queries.queryPartitions(this.pool).then(r => r.filter(p => targetSchemas.includes(p.child_schema))).catch(() => []),
      queries.queryPolicies(this.pool).then(r => r.filter(p => targetSchemas.includes(p.schema))).catch(() => []),
      queries.queryExtensions(this.pool).catch(() => []),
      queries.queryInheritance(this.pool).then(r => r.filter(i => targetSchemas.includes(i.child_schema))).catch(() => []),
      queries.queryComments(this.pool).catch(() => ({})),
      queries.queryGrants(this.pool).then(r => r.filter(g => targetSchemas.includes(g.schema))).catch(() => []),
      queries.queryStatistics(this.pool, version).then(r => r.filter(s => targetSchemas.includes(s.schema))).catch(() => []),
      queries.queryCollations(this.pool).then(r => r.filter(c => targetSchemas.includes(c.schema))).catch(() => []),
      queries.queryConversions(this.pool).then(r => r.filter(c => targetSchemas.includes(c.schema))).catch(() => []),
      queries.queryOperators(this.pool).then(r => r.filter(o => targetSchemas.includes(o.schema))).catch(() => []),
      queries.queryOperatorClasses(this.pool).then(r => r.filter(o => targetSchemas.includes(o.schema))).catch(() => []),
      queries.queryOperatorFamilies(this.pool).then(r => r.filter(o => targetSchemas.includes(o.schema))).catch(() => []),
      queries.queryTextSearchConfigs(this.pool).then(r => ({
        configs: (r.configs || []).filter(t => targetSchemas.includes(t.schema)),
        tokenMappings: (r.tokenMappings || []).filter(t => targetSchemas.includes(t.schema)),
      })).catch(() => ({ configs: [], tokenMappings: [] })),
      queries.queryTextSearchDictionaries(this.pool).then(r => r.filter(t => targetSchemas.includes(t.schema))).catch(() => []),
      queries.queryTextSearchParsers(this.pool).then(r => r.filter(t => targetSchemas.includes(t.schema))).catch(() => []),
      queries.queryTextSearchTemplates(this.pool).then(r => r.filter(t => targetSchemas.includes(t.schema))).catch(() => []),
      queries.queryForeignTables(this.pool).then(r => ({
        tables: (r.tables || []).filter(f => targetSchemas.includes(f.schema)),
        columnOptions: (r.columnOptions || []).filter(c => targetSchemas.includes(c.schema)),
      })).catch(() => ({ tables: [], columnOptions: [] })),
      queries.queryMultiranges(this.pool, version).then(r => r.filter(m => targetSchemas.includes(m.schema))).catch(() => []),
      queries.queryRules(this.pool).then(r => r.filter(r => targetSchemas.includes(r.schema))).catch(() => []),
      queries.queryFunctions(this.pool).then(r => r.filter(f => targetSchemas.includes(f.schema) && f.kind === 'AGGREGATE')).catch(() => []),
      queries.queryFunctions(this.pool).then(r => r.filter(f => targetSchemas.includes(f.schema) && f.kind === 'PROCEDURE')).catch(() => []),
      queries.queryToastOptions(this.pool).then(r => r.filter(t => targetSchemas.includes(t.schema))).catch(() => []),
    ]);

    // PG18+ features
    let pg18Features = { notEnforced: [], virtualColumns: [] };
    if (pgMajor >= 18) {
      pg18Features = await queries.queryPg18Features(this.pool).catch(() => ({ notEnforced: [], virtualColumns: [] }));
    }

    // Current database info
    let databaseInfo = null;
    try {
      const dbResult = await this.pool.query(`
        SELECT 
          current_database() AS name,
          pg_catalog.pg_get_userbyid(datdba) AS owner,
          pg_catalog.pg_encoding_to_char(encoding) AS encoding,
          datcollate AS collate,
          datctype AS ctype
        FROM pg_catalog.pg_database 
        WHERE datname = current_database()
      `);
      databaseInfo = dbResult.rows[0] || null;
    } catch {
      databaseInfo = null;
    }

    // Translate raw results to SchemaSnapshot
    const snapshot = translateSnapshot({
      version: { numeric: version, major: pgMajor, string: versionStr },
      database: databaseInfo,
      schemas: schemasResult,
      tables,
      columns,
      constraints,
      indexes,
      indexColumns,
      functions,
      triggers,
      types: {
        ...typesResult,
        multiranges,
      },
      views: viewsResult.views || [],
      materializedViews: viewsResult.materializedViews || [],
      sequences,
      partitions,
      policies,
      extensions,
      inheritance,
      comments,
      grants,
      pg18Features,
      // New object types
      publications,
      subscriptions,
      statistics,
      collations,
      conversions,
      operators,
      operatorClasses,
      operatorFamilies,
      textSearchConfigs,
      textSearchDictionaries,
      textSearchParsers,
      textSearchTemplates,
      foreignDataWrappers,
      foreignServers,
      userMappings,
      foreignTables,
      casts,
      eventTriggers,
      rules,
      roles,
      tablespaces,
      accessMethods,
      proceduralLanguages,
      defaultPrivileges,
      databases,
      aggregates,
      procedures,
      toastOptions,
    });

    return snapshot;
  }

  /**
   * Resolve user schemas (excluding system schemas).
   * @returns {Promise<string[]>}
   */
  async resolveUserSchemas() {
    const result = await this.pool.query(`
      SELECT n.nspname AS name
      FROM pg_catalog.pg_namespace n
      WHERE n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
        AND n.nspname NOT LIKE 'pg_temp_%'
        AND n.nspname NOT LIKE 'pg_toast_temp_%'
      ORDER BY n.nspname
    `);
    return result.rows.map(r => r.name);
  }

  /** @returns {Promise<number>} */
  async detectVersion() {
    return detectPgVersion(this.pool);
  }

  /** @returns {Promise<string>} */
  async detectVersionString() {
    const result = await this.pool.query("SELECT current_setting('server_version') AS version");
    return result.rows[0].version;
  }
}
