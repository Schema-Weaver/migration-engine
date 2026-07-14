import crypto from 'crypto';

/**
 * SchemaSnapshot Shape (complete)
 * 
 * {
 *   version: { major, minor, patch, numeric },
 *   timestamp: string,
 *   database: { name, owner, encoding, collate, ctype },
 *   
 *   // Database-level objects
 *   roles: [{ name, superuser, inherit, createRole, createDB, canLogin, memberships }],
 *   tablespaces: [{ name, owner, location, acl }],
 *   casts: [{ sourceType, targetType, function, context, method }],
 *   accessMethods: [{ name, handler, type }],
 *   languages: [{ name, owner, trusted, handler }],
 *   defaultPrivileges: [{ role, schema, objectType, acl }],
 *   databases: [{ name, owner, encoding, collate, ctype, isTemplate, allowConn }],
 *   
 *   // Cross-schema objects
 *   publications: [{ name, owner, allTables, operations, tables, schemas }],
 *   subscriptions: [{ name, conninfo(REDRACTED), slotName, publications, enabled }],
 *   
 *   // Per-schema objects
 *   schemas: {
 *     [schemaName]: {
 *       tables: [...],
 *       columns: [...],          // With ALL 14 properties
 *       indexes: [...],
 *       constraints: [...],      // PK, UNIQUE, FK, CHECK, EXCLUSION, NOT NULL
 *       sequences: [...],
 *       views: [...],
 *       materializedViews: [...],
 *       functions: [...],
 *       procedures: [...],
 *       aggregates: [...],
 *       triggers: [...],
 *       eventTriggers: [...],
 *       policies: [...],
 *       enums: [...],
 *       compositeTypes: [...],
 *       domainTypes: [...],
 *       rangeTypes: [...],
 *       multirangeTypes: [...],
 *       rules: [...],
 *       collations: [...],
 *       conversions: [...],
 *       operators: [...],
 *       operatorClasses: [...],
 *       operatorFamilies: [...],
 *       textSearchConfigs: [...],
 *       textSearchDictionaries: [...],
 *       textSearchParsers: [...],
 *       textSearchTemplates: [...],
 *       foreignTables: [...],
 *       extensions: [...],
 *       statistics: [...],
 *       inheritance: [...],
 *       partitions: [...],
 *       comments: [...],
 *       grants: [...],           // Table-level + column-level
 *       defaultPrivileges: [...],
 *     }
 *   }
 * }
 */

/**
 * Translates raw pg_catalog query results into the canonical SchemaSnapshot.
 * This is a PURE READ-ONLY operation - we never modify the user's schema.
 * @param {Object} raw
 * @returns {import('../types/schema.js').SchemaSnapshot}
 */
export function translateSnapshot(raw) {
  const {
    version,
    database,
    schemas = [],
    tables = [],
    columns = [],
    constraints = [],
    indexes = [],
    indexColumns = [],
    functions = [],
    triggers = [],
    types = { enums: [], composites: [], domains: [], ranges: [], multiranges: [] },
    views = [],
    materializedViews = [],
    sequences = [],
    partitions = [],
    policies = [],
    extensions = [],
    inheritance = [],
    comments = {},
    grants = [],
    pg18Features = { notEnforced: [], virtualColumns: [] },
    // New object types
    publications = [],
    subscriptions = [],
    statistics = [],
    collations = [],
    conversions = [],
    operators = [],
    operatorClasses = [],
    operatorFamilies = [],
    textSearchConfigs = {},
    textSearchDictionaries = [],
    textSearchParsers = [],
    textSearchTemplates = [],
    foreignDataWrappers = [],
    foreignServers = [],
    userMappings = [],
    foreignTables = {},
    casts = [],
    eventTriggers = [],
    rules = [],
    roles = [],
    tablespaces = [],
    accessMethods = [],
    proceduralLanguages = [],
    defaultPrivileges = [],
    databases = [],
    aggregates = [],
    procedures = [],
    toastOptions = [],
  } = raw;

  const schemaMap = {};
  for (const s of schemas) {
    schemaMap[s.name] = {
      name: s.name,
      owner: s.owner,
      privileges: parseACL(s.privileges),
      comment: s.comment || undefined,
      tables: [],
      views: [],
      materializedViews: [],
      indexes: [],
      sequences: [],
      functions: [],
      procedures: [],
      aggregates: [],
      triggers: [],
      eventTriggers: [],
      policies: [],
      types: [],
      enums: [],
      compositeTypes: [],
      domainTypes: [],
      rangeTypes: [],
      multirangeTypes: [],
      rules: [],
      collations: [],
      conversions: [],
      operators: [],
      operatorClasses: [],
      operatorFamilies: [],
      textSearchConfigs: [],
      textSearchDictionaries: [],
      textSearchParsers: [],
      textSearchTemplates: [],
      foreignTables: [],
      extensions: [],
      statistics: [],
      comments: {},
      grants: [],
      defaultPrivileges: [],
    };
  }

  const tableMap = {};
  for (const t of tables) {
    const key = `${t.schema}.${t.name}`;
    const isForeignTable = t.kind === 'f';
    tableMap[key] = {
      schema: t.schema,
      name: t.name,
      owner: t.owner,
      isTemporary: t.persistence === 't',
      isUnlogged: t.persistence === 'u',
      isPartitioned: t.kind === 'p',
      isPartition: partitions.some(p => p.child_table === t.name && p.child_schema === t.schema),
      isForeignTable,
      partitionStrategy: t.partition_strategy ? ({ r: 'RANGE', l: 'LIST', h: 'HASH' }[t.partition_strategy] || t.partition_strategy) : undefined,
      partitionColumns: partitions.find(p => p.child_table === t.name && p.child_schema === t.schema)?.partition_columns || undefined,
      partitionParent: (() => {
        const p = partitions.find(p => p.child_table === t.name && p.child_schema === t.schema);
        return p ? `${p.parent_schema}.${p.parent_table}` : undefined;
      })(),
      partitionBound: t.partition_bound || undefined,
      partitionKeyDef: t.partition_key_def || undefined,
      isDefaultPartition: partitions.find(p => p.child_table === t.name && p.child_schema === t.schema)?.is_default || false,
      partitionExpression: partitions.find(p => p.child_table === t.name && p.child_schema === t.schema)?.partition_expression || undefined,
      inheritsFrom: inheritance.filter(i => i.child_table === t.name && i.child_schema === t.schema).map(i => `${i.parent_schema}.${i.parent_table}`),
      tablespace: t.tablespace || undefined,
      storageParameters: t.storage_options ? parseStorageOptions(t.storage_options) : undefined,
      replicaIdentity: (() => {
        if (t.replica_identity === 'd') return 'default';
        if (t.replica_identity === 'f') return 'full';
        if (t.replica_identity === 'n') return 'nothing';
        if (t.replica_identity === 'i' && t.replica_identity_index) return `index:${t.replica_identity_index}`;
        return undefined;
      })(),
      accessMethod: t.access_method || undefined,
      hasOids: t.has_oids || false,
      userCatalog: t.user_catalog_table || false,
      comment: comments[key] || undefined,
      privileges: [],
      rowLevelSecurity: t.rls_enabled,
      forceRowLevelSecurity: t.rls_forced,
      rlsEnabled: t.rls_enabled,
      rlsForced: t.rls_forced,
      columns: [],
      constraints: [],
      indexes: [],
      triggers: [],
      policies: [],
      foreignServer: undefined,
      foreignOptions: undefined,
    };
    if (schemaMap[t.schema]) {
      if (isForeignTable) {
        schemaMap[t.schema].foreignTables.push(key);
      } else {
        schemaMap[t.schema].tables.push(key);
      }
    }
  }

  // Add foreign table details
  const ftTables = foreignTables.tables || foreignTables || [];
  const ftColumnOptions = foreignTables.columnOptions || [];
  
  for (const ft of ftTables) {
    const key = `${ft.schema}.${ft.name}`;
    if (tableMap[key]) {
      tableMap[key].foreignServer = ft.server_name;
      tableMap[key].foreignOptions = ft.options || {};
      tableMap[key].comment = ft.comment || tableMap[key].comment;
      tableMap[key].privileges = ft.privileges || tableMap[key].privileges;
    }
  }

  // Add foreign table column options
  const ftColOptionsMap = {};
  for (const col of ftColumnOptions) {
    const key = `${col.schema}.${col.table_name}`;
    if (!ftColOptionsMap[key]) ftColOptionsMap[key] = {};
    ftColOptionsMap[key][col.column_name] = col.options;
  }
  
  for (const [key, columnOpts] of Object.entries(ftColOptionsMap)) {
    if (tableMap[key] && tableMap[key].columns) {
      for (const col of tableMap[key].columns) {
        if (columnOpts[col.name]) {
          col.foreignOptions = columnOpts[col.name];
        }
      }
    }
  }

  // Add TOAST storage options to tables
  for (const t of toastOptions) {
    const key = `${t.schema}.${t.table_name}`;
    if (tableMap[key]) {
      tableMap[key].toastStorageOptions = t.toast_storage_options ? parseStorageOptions(t.toast_storage_options) : undefined;
      tableMap[key].toastTableName = t.toast_table_name;
    }
  }

  for (const col of columns) {
    const key = `${col.schema}.${col.table_name}`;
    if (tableMap[key]) {
      const isGenerated = col.generated === 's' || col.generated === 'v';
      const isIdentity = col.identity === 'a' || col.identity === 'd';
      tableMap[key].columns.push({
        name: col.name,
        dataType: col.data_type,
        ordinalPosition: col.ordinal_position,
        isNullable: col.is_nullable,
        defaultValue: col.default_value || undefined,
        isGenerated,
        generatedExpression: isGenerated ? col.generated_expression : undefined,
        generatedStorage: col.generated === 'v' ? 'VIRTUAL' : col.generated === 's' ? 'STORED' : undefined,
        isIdentity,
        identityMode: col.identity === 'a' ? 'ALWAYS' : col.identity === 'd' ? 'BY_DEFAULT' : undefined,
        identityStart: col.identity_start ?? undefined,
        identityIncrement: col.identity_increment ?? undefined,
        identityMin: col.identity_min ?? undefined,
        identityMax: col.identity_max ?? undefined,
        identityCycle: col.identity_cycle ?? undefined,
        identityCache: col.identity_cache ?? undefined,
        collation: col.collation || undefined,
        storage: col.storage || undefined,
        comment: col.comment || undefined,
        statisticsTarget: col.statistics_target ?? undefined,
        compression: col.compression || undefined,
        inheritedCount: col.inherited_count ?? 0,
        isLocal: col.is_local ?? false,
        privileges: parseACL(col.privileges),
        isPrimaryKey: col.is_primary_key ?? false,
        isUnique: col.is_unique ?? false,
        length: col.length ?? undefined,
        arrayDimensions: col.array_dimensions ?? undefined,
        foreignOptions: col.foreign_options || undefined,
      });
    }
  }

  // Fix: Iterate over Object.values(tableMap), not tableMap directly
  for (const table of Object.values(tableMap)) {
    table.columns.sort((a, b) => a.ordinalPosition - b.ordinalPosition);
  }

  const constraintMap = {};
  for (const c of constraints) {
    const key = `${c.schema}.${c.name}`;
    const tableKey = c.table_ref?.includes('.') ? c.table_ref : `${c.schema}.${c.table_ref}`;
    constraintMap[key] = {
      schema: c.schema,
      name: c.name,
      table: tableKey,
      type: c.type,
      deferrable: c.deferrable,
      initiallyDeferred: c.initially_deferred,
      isValidated: c.is_validated,
      enforced: c.type === 'FOREIGN_KEY' ? true : (pg18Features.notEnforced.find(ne => ne.name === c.name && ne.schema === c.schema) ? false : true),
      noInherit: c.no_inherit,
      isInherited: c.is_inherited,
      isLocal: c.is_local,
      comment: c.comment || undefined,
      definition: c.definition,
      columns: c.column_indices ? getColumnNamesFromIndices(tableKey, c.column_indices, tableMap) : undefined,
      referencedTable: c.foreign_table || undefined,
      referencedColumns: c.foreign_column_indices ? getColumnNamesFromIndices(c.foreign_table, c.foreign_column_indices, tableMap) : undefined,
      matchType: c.match_type || undefined,
      onDelete: c.on_delete || undefined,
      onUpdate: c.on_update || undefined,
      index: c.index_name || undefined,
      indexTablespace: c.index_tablespace || undefined,
      exclusionExpression: c.exclusion_expression || undefined,
    };
    if (tableMap[tableKey]) {
      tableMap[tableKey].constraints.push(key);
    }
  }

  const indexMap = {};
  for (const idx of indexes) {
    const key = `${idx.schema}.${idx.index_name}`;
    const tableKey = `${idx.table_schema}.${idx.table_name}`;
    
    // Get columns for this index and remove duplicates
    let cols = indexColumns.filter(ic => ic.index_relname === idx.index_relname && ic.schema === idx.schema);
    // Remove duplicates by position
    const seenPositions = new Set();
    cols = cols.filter(ic => {
      if (seenPositions.has(ic.position)) return false;
      seenPositions.add(ic.position);
      return true;
    });
    
    // Build include columns list (columns after number_of_key_columns)
    const numKeyCols = idx.number_of_key_columns || cols.length;
    const includeCols = numKeyCols < cols.length 
      ? cols.slice(numKeyCols).map(c => c.column_name) 
      : undefined;
    
    indexMap[key] = {
      schema: idx.schema,
      name: idx.index_name,
      table: tableKey,
      isUnique: idx.is_unique,
      isPrimary: idx.is_primary,
      isConcurrent: false,
      method: idx.method,
      columns: cols.slice(0, numKeyCols).map((c, i) => ({
        expression: c.expression || c.column_name || undefined,
        collation: c.collation || undefined,
        opclass: c.opclass || undefined,
        direction: c.direction || undefined,
        nullsOrder: c.nulls_order || undefined,
        comment: c.column_comment || undefined,
      })),
      includeColumns: includeCols,
      whereClause: idx.where_clause || undefined,
      storageParameters: idx.storage_options ? parseStorageOptions(idx.storage_options) : undefined,
      tablespace: idx.tablespace || undefined,
      comment: idx.comment || undefined,
      owner: idx.owner,
      isValid: idx.is_valid ?? true,
      isReady: idx.is_ready ?? true,
      isLive: idx.is_live ?? true,
      isReplicaIdentity: idx.is_replica_identity ?? false,
      isClustered: idx.is_clustered ?? false,
      numberOfKeyColumns: numKeyCols,
      nullsNotDistinct: idx.nulls_not_distinct || undefined,
      brinPagesPerRange: idx.brin_pages_per_range ?? undefined,
      definition: idx.definition,
    };
    if (tableMap[tableKey]) {
      tableMap[tableKey].indexes.push(key);
    }
    if (schemaMap[idx.schema]) {
      schemaMap[idx.schema].indexes.push(key);
    }
  }

  const functionMap = {};
  for (const f of functions) {
    const key = `${f.schema}.${f.name}(${f.argument_types || ''})`;
    functionMap[key] = {
      schema: f.schema,
      name: f.name,
      argumentTypes: f.argument_types ? f.argument_types.split(',').map(s => s.trim()).filter(Boolean) : [],
      argumentNames: f.argument_names || [],
      argumentDefaults: f.argument_defaults || undefined,
      argumentModes: f.argument_modes || [],
      returnType: f.return_type,
      returnSet: f.return_set || false,
      language: f.language,
      source: f.source,
      precompiledBody: f.precompiled_body || undefined,
      volatility: f.volatility,
      isStrict: f.is_strict,
      security: f.security,
      parallel: f.parallel,
      isLeakproof: f.is_leakproof,
      cost: f.cost,
      rows: f.rows,
      kind: f.kind,
      owner: f.owner,
      configuration: f.configuration || undefined,
      supportFunction: f.support_function || undefined,
      privileges: f.privileges || undefined,
      comment: f.comment || undefined,
      sfunc: f.agg_sfunc || undefined,
      stype: f.agg_stype || undefined,
      finalfunc: f.agg_finalfunc || undefined,
      combinefunc: f.agg_combinefunc || undefined,
      initcond: f.agg_initcond || undefined,
      sspace: f.agg_sspace || undefined,
      finalfuncExtra: f.agg_finalfunc_extra || false,
      finalfuncModify: f.agg_finalfunc_modify || undefined,
      serialfunc: f.agg_serialfunc || undefined,
      deserialfunc: f.agg_deserialfunc || undefined,
      sortop: f.agg_sortop || undefined,
      hypothetical: f.agg_hypothetical || false,
    };
    if (schemaMap[f.schema]) {
      if (f.kind === 'AGGREGATE') {
        schemaMap[f.schema].aggregates.push(key);
      } else if (f.kind === 'PROCEDURE') {
        schemaMap[f.schema].procedures.push(key);
      } else {
        schemaMap[f.schema].functions.push(key);
      }
    }
  }

  const triggerMap = {};
  for (const t of triggers) {
    const key = `${t.schema}.${t.table_name}.${t.name}`;
    const tableKey = `${t.table_schema}.${t.table_name}`;
    triggerMap[key] = {
      schema: t.schema,
      name: t.name,
      table: tableKey,
      timing: t.timing,
      events: t.events || [],
      level: t.level || 'ROW',
      isForEachRow: t.is_for_each_row,
      function: t.function_call || `${t.function_schema}.${t.function_name}`,
      whenCondition: t.when_condition || undefined,
      functionCall: t.function_call,
      enabled: t.enabled,
      isConstraint: t.is_constraint || false,
      isDeferrable: t.is_deferrable || false,
      isDeferred: t.is_deferred || false,
      updateOfColumns: t.update_of_columns || [],
      oldTableName: t.old_table_name || undefined,
      newTableName: t.new_table_name || undefined,
      comment: t.comment || undefined,
    };
    if (tableMap[tableKey]) {
      tableMap[tableKey].triggers.push(key);
    }
  }

  const typeMap = {};
  for (const e of types.enums) {
    const key = `${e.schema}.${e.name}`;
    typeMap[key] = {
      schema: e.schema,
      name: e.name,
      kind: 'ENUM',
      enumValues: e.enum_values || [],
      owner: e.owner,
      comment: e.comment || undefined,
      privileges: parseACL(e.privileges),
      arrayType: e.array_type || undefined,
    };
    if (schemaMap[e.schema]) {
      schemaMap[e.schema].enums.push(key);
    }
  }
  for (const c of types.composites) {
    const key = `${c.schema}.${c.name}`;
    typeMap[key] = {
      schema: c.schema,
      name: c.name,
      kind: 'COMPOSITE',
      attributes: c.attributes || [],
      owner: c.owner,
      comment: c.comment || undefined,
    };
    if (schemaMap[c.schema]) {
      schemaMap[c.schema].compositeTypes.push(key);
    }
  }
  for (const d of types.domains) {
    const key = `${d.schema}.${d.name}`;
    typeMap[key] = {
      schema: d.schema,
      name: d.name,
      kind: 'DOMAIN',
      baseType: d.base_type,
      baseTypeSchema: d.base_type_schema || undefined,
      notNull: d.not_null,
      defaultValue: d.default_value || undefined,
      checkConstraint: d.check_constraint || undefined,
      owner: d.owner,
      comment: d.comment || undefined,
      collation: d.collation || undefined,
      privileges: parseACL(d.privileges),
      isValidated: d.is_validated ?? true,
      typmod: d.typmod ?? undefined,
      length: d.length ?? undefined,
    };
    if (schemaMap[d.schema]) {
      schemaMap[d.schema].domainTypes.push(key);
    }
  }
  for (const r of types.ranges) {
    const key = `${r.schema}.${r.name}`;
    typeMap[key] = {
      schema: r.schema,
      name: r.name,
      kind: 'RANGE',
      subtype: r.subtype,
      subtypeSchema: r.subtype_schema || undefined,
      multirangeType: r.multirange_type || undefined,
      collation: r.collation || undefined,
      subtypeOpclass: r.subtype_opclass || undefined,
      subtypeDiff: r.subtype_diff || undefined,
      canonicalFunction: r.canonical_function || undefined,
      owner: r.owner,
      comment: r.comment || undefined,
      privileges: parseACL(r.privileges),
    };
    if (schemaMap[r.schema]) {
      schemaMap[r.schema].rangeTypes.push(key);
    }
  }
  for (const m of types.multiranges || []) {
    const key = `${m.schema}.${m.name}`;
    typeMap[key] = {
      schema: m.schema,
      name: m.name,
      kind: 'MULTIRANGE',
      rangeType: m.range_type,
      owner: m.owner,
      comment: m.comment || undefined,
    };
    if (schemaMap[m.schema]) {
      schemaMap[m.schema].multirangeTypes.push(key);
    }
  }

  const sequenceMap = {};
  for (const s of sequences) {
    const key = `${s.schema}.${s.name}`;
    sequenceMap[key] = {
      schema: s.schema,
      name: s.name,
      dataType: s.data_type,
      startValue: s.start_value !== null ? s.start_value : undefined,
      increment: s.increment !== null ? s.increment : undefined,
      minValue: s.min_value !== null ? s.min_value : undefined,
      maxValue: s.max_value !== null ? s.max_value : undefined,
      cache: s.cache !== null ? s.cache : undefined,
      cycle: s.cycle,
      ownedBy: s.owned_by || undefined,
      owner: s.owner,
      tablespace: s.tablespace || undefined,
      comment: s.comment || undefined,
      currentValue: s.current_value !== null ? s.current_value : undefined,
    };
    if (schemaMap[s.schema]) {
      schemaMap[s.schema].sequences.push(key);
    }
  }

  const extensionMap = {};
  for (const e of extensions) {
    extensionMap[e.name] = {
      name: e.name,
      schema: e.schema,
      version: e.version,
      owner: e.owner,
      isRelocatable: e.is_relocatable || false,
      comment: e.comment || undefined,
      isAvailable: e.is_available !== false,
    };
    if (schemaMap[e.schema]) {
      schemaMap[e.schema].extensions.push(e.name);
    }
  }

  const policyMap = {};
  for (const p of policies) {
    const key = `${p.schema}.${p.table_name}.${p.name}`;
    const tableKey = `${p.schema}.${p.table_name}`;
    policyMap[key] = {
      schema: p.schema,
      name: p.name,
      table: tableKey,
      command: p.command,
      isPermissive: p.is_permissive,
      roles: p.roles || [],
      using: p.using_expression || undefined,
      withCheck: p.with_check_expression || undefined,
      comment: p.comment || undefined,
    };
    if (tableMap[tableKey]) {
      tableMap[tableKey].policies.push(key);
    }
  }

  const viewMap = {};
  for (const v of views) {
    const key = `${v.schema}.${v.name}`;
    const relOptions = parseStorageOptions(v.rel_options) || {};
    viewMap[key] = {
      schema: v.schema,
      name: v.name,
      definition: v.definition,
      owner: v.owner,
      checkOption: v.check_option || 'NONE',
      securityBarrier: relOptions.security_barrier === 'true' || relOptions.security_barrier === true || false,
      securityInvoker: relOptions.security_invoker === 'true' || relOptions.security_invoker === true || false,
      isRecursive: v.is_recursive || false,
      columns: v.columns || [],
      privileges: v.privileges || undefined,
      comment: v.comment || undefined,
    };
    if (schemaMap[v.schema]) {
      schemaMap[v.schema].views.push(key);
    }
  }

  const matViewMap = {};
  for (const v of materializedViews) {
    const key = `${v.schema}.${v.name}`;
    matViewMap[key] = {
      schema: v.schema,
      name: v.name,
      definition: v.definition,
      owner: v.owner,
      tablespace: v.tablespace || undefined,
      storageParameters: v.storage_options ? parseStorageOptions(v.storage_options) : undefined,
      isPopulated: v.is_populated !== false,
      withData: v.is_populated !== false,
      columns: v.columns || [],
      privileges: v.privileges || undefined,
      comment: v.comment || undefined,
    };
    if (schemaMap[v.schema]) {
      schemaMap[v.schema].materializedViews.push(key);
    }
  }

  // Statistics objects
  const statisticsMap = {};
  for (const s of statistics) {
    const key = `${s.schema}.${s.name}`;
    statisticsMap[key] = {
      schema: s.schema,
      name: s.name,
      table: s.table_name ? `${s.table_schema}.${s.table_name}` : undefined,
      kinds: s.kinds || [],
      columns: s.columns || [],
      definition: s.definition || undefined,
      owner: s.owner,
      statisticsTarget: s.statisticsTarget ?? undefined,
      comment: s.comment || undefined,
      size: s.size ?? undefined,
    };
    if (schemaMap[s.schema]) {
      schemaMap[s.schema].statistics.push(key);
    }
  }

  // Collations
  const collationMap = {};
  for (const c of collations) {
    const key = `${c.schema}.${c.name}`;
    collationMap[key] = {
      schema: c.schema,
      name: c.name,
      provider: c.provider,
      locale: c.locale || undefined,
      lcCollate: c.lcCollate || undefined,
      lcCtype: c.lcCtype || undefined,
      encoding: c.encoding || undefined,
      isDeterministic: c.isDeterministic !== false,
      version: c.version || undefined,
      comment: c.comment || undefined,
      owner: c.owner,
    };
    if (schemaMap[c.schema]) {
      schemaMap[c.schema].collations.push(key);
    }
  }

  // Conversions
  const conversionMap = {};
  for (const c of conversions) {
    const key = `${c.schema}.${c.name}`;
    conversionMap[key] = {
      schema: c.schema,
      name: c.name,
      sourceEncoding: c.source_encoding,
      targetEncoding: c.target_encoding,
      proc: c.proc,
      isDefault: c.is_default || false,
      owner: c.owner,
      comment: c.comment || undefined,
    };
    if (schemaMap[c.schema]) {
      schemaMap[c.schema].conversions.push(key);
    }
  }

  // Operators
  const operatorMap = {};
  for (const o of operators) {
    const key = `${o.schema}.${o.name}(${o.left_type || 'NONE'},${o.right_type || 'NONE'})`;
    operatorMap[key] = {
      schema: o.schema,
      name: o.name,
      leftType: o.left_type || undefined,
      rightType: o.right_type || undefined,
      resultType: o.result_type || undefined,
      proc: o.proc,
      canHash: o.can_hash || false,
      canMerge: o.can_merge || false,
      commutator: o.commutator,
      negator: o.negator,
      restrictFunction: o.restrict_function || undefined,
      joinFunction: o.join_function || undefined,
      owner: o.owner,
      comment: o.comment || undefined,
    };
    if (schemaMap[o.schema]) {
      schemaMap[o.schema].operators.push(key);
    }
  }

  // Operator Classes
  const operatorClassMap = {};
  for (const oc of operatorClasses) {
    const key = `${oc.schema}.${oc.name}`;
    operatorClassMap[key] = {
      schema: oc.schema,
      name: oc.name,
      family: oc.family,
      inputType: oc.input_type,
      isDefault: oc.is_default || false,
      accessMethod: oc.access_method,
      storageType: oc.storage_type || undefined,
      operators: oc.operators || [],
      functions: oc.functions || [],
      owner: oc.owner,
      comment: oc.comment || undefined,
    };
    if (schemaMap[oc.schema]) {
      schemaMap[oc.schema].operatorClasses.push(key);
    }
  }

  // Operator Families
  const operatorFamilyMap = {};
  for (const ofam of operatorFamilies) {
    const key = `${ofam.schema}.${ofam.name}`;
    operatorFamilyMap[key] = {
      schema: ofam.schema,
      name: ofam.name,
      accessMethod: ofam.access_method,
      owner: ofam.owner,
    };
    if (schemaMap[ofam.schema]) {
      schemaMap[ofam.schema].operatorFamilies.push(key);
    }
  }

  // Text Search Configs
  const tscConfigs = textSearchConfigs.configs || textSearchConfigs || [];
  const tscMappings = textSearchConfigs.tokenMappings || [];
  
  const tokenMappingsMap = {};
  for (const m of tscMappings) {
    const key = `${m.schema}.${m.config_name}`;
    if (!tokenMappingsMap[key]) tokenMappingsMap[key] = [];
    tokenMappingsMap[key].push({
      tokenType: m.token_type,
      seq: m.seq,
      dictionary: `${m.dict_schema}.${m.dictionary}`,
    });
  }
  
  const textSearchConfigMap = {};
  for (const tsc of tscConfigs) {
    const key = `${tsc.schema}.${tsc.name}`;
    textSearchConfigMap[key] = {
      schema: tsc.schema,
      name: tsc.name,
      parser: tsc.parser,
      owner: tsc.owner,
      tokenMappings: tokenMappingsMap[key] || [],
      comment: tsc.comment || undefined,
    };
    if (schemaMap[tsc.schema]) {
      schemaMap[tsc.schema].textSearchConfigs.push(key);
    }
  }

  // Text Search Dictionaries
  const textSearchDictMap = {};
  for (const tsd of textSearchDictionaries) {
    const key = `${tsd.schema}.${tsd.name}`;
    textSearchDictMap[key] = {
      schema: tsd.schema,
      name: tsd.name,
      template: tsd.template,
      options: tsd.options || undefined,
      owner: tsd.owner,
      comment: tsd.comment || undefined,
    };
    if (schemaMap[tsd.schema]) {
      schemaMap[tsd.schema].textSearchDictionaries.push(key);
    }
  }

  // Text Search Parsers
  const textSearchParserMap = {};
  for (const tsp of textSearchParsers) {
    const key = `${tsp.schema}.${tsp.name}`;
    textSearchParserMap[key] = {
      schema: tsp.schema,
      name: tsp.name,
      start: tsp.start,
      getToken: tsp.get_token,
      end: tsp.end,
      headline: tsp.headline || undefined,
      lextypes: tsp.lextypes || undefined,
      owner: tsp.owner,
      comment: tsp.comment || undefined,
    };
    if (schemaMap[tsp.schema]) {
      schemaMap[tsp.schema].textSearchParsers.push(key);
    }
  }

  // Text Search Templates
  const textSearchTemplateMap = {};
  for (const tst of textSearchTemplates) {
    const key = `${tst.schema}.${tst.name}`;
    textSearchTemplateMap[key] = {
      schema: tst.schema,
      name: tst.name,
      lexize: tst.lexize,
      init: tst.init || undefined,
      owner: tst.owner,
      comment: tst.comment || undefined,
    };
    if (schemaMap[tst.schema]) {
      schemaMap[tst.schema].textSearchTemplates.push(key);
    }
  }

  // Foreign Data Wrappers
  const fdwMap = {};
  for (const fdw of foreignDataWrappers) {
    fdwMap[fdw.name] = {
      name: fdw.name,
      handler: fdw.handler || undefined,
      validator: fdw.validator || undefined,
      options: redactOptions(fdw.options),
      owner: fdw.owner,
      privileges: fdw.privileges || undefined,
      comment: fdw.comment || undefined,
    };
  }

  // Foreign Servers
  const foreignServerMap = {};
  for (const fs of foreignServers) {
    foreignServerMap[fs.name] = {
      name: fs.name,
      fdw: fs.fdw,
      type: fs.type || undefined,
      version: fs.version || undefined,
      options: redactOptions(fs.options),
      owner: fs.owner,
      privileges: fs.privileges || undefined,
      comment: fs.comment || undefined,
    };
  }

  // User Mappings
  const userMappingMap = {};
  for (const um of userMappings) {
    const key = `${um.user}@${um.server}`;
    userMappingMap[key] = {
      user: um.user,
      server: um.server,
      options: redactOptions(um.options),
    };
  }

  // Casts
  const castMap = {};
  for (const c of casts) {
    const key = `${c.source_type}->${c.target_type}`;
    castMap[key] = {
      sourceType: c.source_type,
      targetType: c.target_type,
      function: c.function || undefined,
      context: c.context,
      method: c.method,
      comment: c.comment || undefined,
    };
  }

  // Event Triggers
  const eventTriggerMap = {};
  for (const et of eventTriggers) {
    eventTriggerMap[et.name] = {
      name: et.name,
      event: et.event,
      function: et.function,
      enabled: et.enabled,
      tags: et.tags || [],
      owner: et.owner,
      comment: et.comment || undefined,
    };
  }

  // Rules
  const ruleMap = {};
  for (const r of rules) {
    const key = `${r.schema}.${r.table}.${r.name}`;
    ruleMap[key] = {
      schema: r.schema,
      name: r.name,
      table: `${r.schema}.${r.table}`,
      event: r.event,
      isInstead: r.is_instead || false,
      isEnabled: r.is_enabled !== false,
      definition: r.definition || undefined,
      condition: r.qual || undefined,
      comment: r.comment || undefined,
    };
    if (schemaMap[r.schema]) {
      schemaMap[r.schema].rules.push(key);
    }
  }

  // Roles
  const roleMap = {};
  for (const r of roles) {
    roleMap[r.name] = {
      name: r.name,
      isSuperuser: r.is_superuser || false,
      canCreateRole: r.can_create_role || false,
      canCreateDB: r.can_create_db || false,
      canLogin: r.can_login || false,
      inherit: r.inherit !== false,
      memberships: r.memberships || [],
      comment: r.comment || undefined,
    };
  }

  // Tablespaces
  const tablespaceMap = {};
  for (const ts of tablespaces) {
    tablespaceMap[ts.name] = {
      name: ts.name,
      owner: ts.owner,
      location: ts.location || undefined,
      acl: ts.acl || undefined,
      options: ts.options || undefined,
    };
  }

  // Access Methods
  const accessMethodMap = {};
  for (const am of accessMethods) {
    accessMethodMap[am.name] = {
      name: am.name,
      type: am.type,
      handler: am.handler || undefined,
    };
  }

  // Procedural Languages
  const languageMap = {};
  for (const lang of proceduralLanguages) {
    languageMap[lang.name] = {
      name: lang.name,
      isTrusted: lang.is_trusted || false,
      handler: lang.handler || undefined,
      inline: lang.inline || undefined,
      validator: lang.validator || undefined,
      owner: lang.owner,
    };
  }

  // Default Privileges
  const defaultPrivMap = {};
  let dpIdx = 0;
  for (const dp of defaultPrivileges) {
    const key = `default_priv_${dpIdx++}`;
    defaultPrivMap[key] = {
      role: dp.role,
      schema: dp.schema || undefined,
      objectType: dp.object_type,
      acl: dp.acl,
    };
  }

  // Databases
  const databaseMap = {};
  for (const db of databases) {
    databaseMap[db.name] = {
      name: db.name,
      owner: db.owner,
      encoding: db.encoding,
      collate: db.collate,
      ctype: db.ctype,
      isTemplate: db.is_template || false,
      allowConn: db.allow_conn !== false,
      size: db.size || undefined,
    };
  }

  // Publications
  const publicationMap = {};
  for (const pub of publications) {
    publicationMap[pub.name] = {
      name: pub.name,
      owner: pub.owner,
      allTables: pub.all_tables || false,
      insert: pub.insert !== false,
      update: pub.update !== false,
      delete: pub.delete !== false,
      truncate: pub.truncate !== false,
      viaRoot: pub.via_root || false,
      tables: pub.tables || [],
      schemas: pub.schemas || [],
      comment: pub.comment || undefined,
    };
  }

  // Subscriptions (with PII redaction)
  const subscriptionMap = {};
  for (const sub of subscriptions) {
    subscriptionMap[sub.name] = {
      name: sub.name,
      conninfo: redactConnectionString(sub.conninfo),
      slotName: sub.slot_name || undefined,
      publications: sub.publications || [],
      enabled: sub.enabled !== false,
      syncCommit: sub.sync_commit || undefined,
      binaryTransfer: sub.binary_transfer || false,
      streaming: sub.streaming === 'p' ? 'parallel' : (sub.streaming === 't' ? 'on' : 'off'),
      twoPhase: sub.two_phase || false,
      disableOnError: sub.disable_on_error || false,
      origin: sub.origin || 'any',
      owner: sub.owner,
      comment: sub.comment || undefined,
    };
  }

  // Distribute comments to schemas
  const commentsMap = {};
  for (const [key, comment] of Object.entries(comments)) {
    commentsMap[key] = comment;
    const parts = key.split('.');
    if (parts.length >= 1) {
      const schemaName = parts[0];
      if (schemaMap[schemaName]) {
        schemaMap[schemaName].comments[key] = comment;
      }
    }
  }

  // Distribute grants to schemas
  const grantList = [];
  for (const g of grants) {
    grantList.push({
      schema: g.schema,
      object: g.object,
      objectType: g.object_type,
      privilege: g.privilege,
      grantee: g.grantee,
      grantor: g.grantor,
      isGrantable: g.is_grantable || false,
      column: g.column || undefined,
    });
    if (schemaMap[g.schema]) {
      schemaMap[g.schema].grants.push(g.object);
    }
    if (g.objectType === 'TABLE' || g.object_type === 'TABLE' || g.object_type === 'PARTITIONED TABLE') {
      const tableKey = `${g.schema}.${g.object}`;
      if (tableMap[tableKey]) {
        tableMap[tableKey].privileges.push({
          privilege: g.privilege,
          grantee: g.grantee,
          grantor: g.grantor,
          isGrantable: g.is_grantable || false,
        });
      }
    }
  }

  // Checksum calculation
  const canonicalObj = {
    schemas: schemaMap,
    tables: tableMap,
    views: viewMap,
    materializedViews: matViewMap,
    indexes: indexMap,
    functions: functionMap,
    triggers: triggerMap,
    types: typeMap,
    sequences: sequenceMap,
    constraints: constraintMap,
    policies: policyMap,
    extensions: extensionMap,
    statistics: statisticsMap,
    collations: collationMap,
    conversions: conversionMap,
    operators: operatorMap,
    operatorClasses: operatorClassMap,
    operatorFamilies: operatorFamilyMap,
    textSearchConfigs: textSearchConfigMap,
    textSearchDictionaries: textSearchDictMap,
    textSearchParsers: textSearchParserMap,
    textSearchTemplates: textSearchTemplateMap,
    rules: ruleMap,
    publications: publicationMap,
    subscriptions: subscriptionMap,
  };
  const sortedObj = {};
  for (const key of Object.keys(canonicalObj).sort()) {
    sortedObj[key] = canonicalObj[key];
  }
  const canonical = JSON.stringify(sortedObj);
  const checksum = crypto.createHash('sha256').update(canonical).digest('hex');

  return {
    version: typeof version === 'object' ? version : { numeric: version, string: version.toString() },
    timestamp: new Date().toISOString(),
    checksum,
    database: database || undefined,
    schemas: schemaMap,
    tables: tableMap,
    views: viewMap,
    materializedViews: matViewMap,
    indexes: indexMap,
    functions: functionMap,
    procedures: Object.fromEntries(Object.entries(functionMap).filter(([k, v]) => v.kind === 'PROCEDURE')),
    aggregates: Object.fromEntries(Object.entries(functionMap).filter(([k, v]) => v.kind === 'AGGREGATE')),
    triggers: triggerMap,
    eventTriggers: eventTriggerMap,
    policies: policyMap,
    types: typeMap,
    sequences: sequenceMap,
    extensions: extensionMap,
    constraints: constraintMap,
    statistics: statisticsMap,
    collations: collationMap,
    conversions: conversionMap,
    operators: operatorMap,
    operatorClasses: operatorClassMap,
    operatorFamilies: operatorFamilyMap,
    textSearchConfigs: textSearchConfigMap,
    textSearchDictionaries: textSearchDictMap,
    textSearchParsers: textSearchParserMap,
    textSearchTemplates: textSearchTemplateMap,
    foreignDataWrappers: fdwMap,
    foreignServers: foreignServerMap,
    userMappings: userMappingMap,
    casts: castMap,
    rules: ruleMap,
    roles: roleMap,
    tablespaces: tablespaceMap,
    accessMethods: accessMethodMap,
    languages: languageMap,
    defaultPrivileges: defaultPrivMap,
    databases: databaseMap,
    publications: publicationMap,
    subscriptions: subscriptionMap,
    comments: commentsMap,
    grants: grantList,
  };
}

function parseStorageOptions(options) {
  if (!options) return undefined;
  const result = {};
  for (const opt of options) {
    const match = opt.match(/^([^=]+)=(.*)$/);
    if (match) {
      result[match[1]] = isNaN(match[2]) ? match[2] : Number(match[2]);
    }
  }
  return result;
}

function getColumnNamesFromIndices(tableRef, indices, tableMap) {
  if (!tableRef || !indices) return undefined;
  const table = Object.values(tableMap).find(t => `${t.schema}.${t.name}` === tableRef);
  if (!table) return undefined;
  return indices.map(idx => table.columns.find(c => c.ordinalPosition === idx)?.name).filter(Boolean);
}

function redactConnectionString(connStr) {
  if (!connStr) return connStr;
  return connStr.replace(/password=[^'"\s]+/gi, 'password=[REDACTED]');
}

function redactOptions(options) {
  if (!options) return options;
  if (typeof options === 'string') {
    return options.replace(/password=[^'"\s]+/gi, 'password=[REDACTED]');
  }
  if (Array.isArray(options)) {
    return options.map(opt => {
      if (typeof opt === 'string' && opt.toLowerCase().includes('password')) {
        return opt.replace(/password=\S+/gi, 'password=[REDACTED]');
      }
      return opt;
    });
  }
  if (typeof options === 'object') {
    const redacted = { ...options };
    for (const key of Object.keys(redacted)) {
      if (key.toLowerCase().includes('password') || key.toLowerCase().includes('secret')) {
        redacted[key] = '[REDACTED]';
      }
    }
    return redacted;
  }
  return options;
}

function parseACL(acl) {
  if (!acl) return [];
  if (typeof acl === 'string') {
    return acl.replace(/[{}"]/g, '').split(',').filter(Boolean);
  }
  if (Array.isArray(acl)) {
    return acl.map(a => typeof a === 'string' ? a.replace(/[{}"]/g, '') : a).filter(Boolean);
  }
  return [];
}

export function normalizeSchema(raw) {
  return translateSnapshot(raw);
}
