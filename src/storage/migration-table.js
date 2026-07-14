import crypto from 'crypto';

const ENGINE_VERSION = '1.0.0';

export class MigrationTable {
  tableName = 'migration_history';

  constructor(pool, connectionId = null) {
    this.pool = pool;
    this.connectionId = connectionId;

    if (!connectionId) {
      console.warn(
        '[SchemaWeaver] No connectionId provided. ' +
        'Migration records will not be scoped to a specific database. ' +
        'This may cause issues in multi-database environments.'
      );
    }
  }

  async ensureTable() {
    const tableCheck = await this.pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'migration_history'
      )
    `);

    if (!tableCheck.rows[0].exists) {
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS migration_history (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          connection_id UUID,
          version VARCHAR(30) NOT NULL,
          name VARCHAR(255) NOT NULL,
          checksum VARCHAR(64) NOT NULL DEFAULT '',
          up_sql TEXT NOT NULL DEFAULT '',
          down_sql TEXT,
          full_snapshot_sql TEXT,
          commit_message TEXT,
          applied_by UUID,
          status VARCHAR(20) NOT NULL DEFAULT 'pending',
          execution_time_ms INTEGER,
          error_message TEXT,
          rolled_back_at TIMESTAMPTZ,
          rolled_back_by UUID,
          metadata JSONB,
          applied_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ DEFAULT now(),

          schema_diff JSONB,
          sql_statements JSONB,
          execution_results JSONB,
          snapshot_before JSONB,
          snapshot_after JSONB,
          risk_summary JSONB,
          warnings JSONB,
          direction VARCHAR(10) DEFAULT 'up',
          change_count INTEGER DEFAULT 0,
          create_count INTEGER DEFAULT 0,
          alter_count INTEGER DEFAULT 0,
          drop_count INTEGER DEFAULT 0,
          rename_count INTEGER DEFAULT 0,
          pg_version VARCHAR(20),
          engine_version VARCHAR(20),
          rollback_sql JSONB,
          tags TEXT[]
        )
      `);
    } else {
      await this.ensureEngineColumns();
    }

    await this.ensureIndexes();
    await this.checkLegacyTable();
  }

  async ensureEngineColumns() {
    const engineColumns = [
      { name: 'schema_diff', type: 'JSONB' },
      { name: 'sql_statements', type: 'JSONB' },
      { name: 'execution_results', type: 'JSONB' },
      { name: 'snapshot_before', type: 'JSONB' },
      { name: 'snapshot_after', type: 'JSONB' },
      { name: 'risk_summary', type: 'JSONB' },
      { name: 'warnings', type: 'JSONB' },
      { name: 'direction', type: 'VARCHAR(10)', def: "'up'" },
      { name: 'change_count', type: 'INTEGER', def: '0' },
      { name: 'create_count', type: 'INTEGER', def: '0' },
      { name: 'alter_count', type: 'INTEGER', def: '0' },
      { name: 'drop_count', type: 'INTEGER', def: '0' },
      { name: 'rename_count', type: 'INTEGER', def: '0' },
      { name: 'pg_version', type: 'VARCHAR(20)' },
      { name: 'engine_version', type: 'VARCHAR(20)' },
      { name: 'rollback_sql', type: 'JSONB' },
      { name: 'tags', type: 'TEXT[]' },
    ];

    for (const col of engineColumns) {
      const colCheck = await this.pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.columns
          WHERE table_name = 'migration_history'
            AND column_name = $1
        )
      `, [col.name]);

      if (!colCheck.rows[0].exists) {
        const defaultClause = col.def ? ` DEFAULT ${col.def}` : '';
        await this.pool.query(`
          ALTER TABLE migration_history
          ADD COLUMN ${col.name} ${col.type}${defaultClause}
        `);
      }
    }
  }

  async ensureIndexes() {
    const indexes = [
      { name: 'idx_migration_history_status', on: 'status' },
      { name: 'idx_migration_history_connection', on: 'connection_id' },
      { name: 'idx_migration_history_applied_at', on: 'applied_at DESC NULLS LAST' },
      { name: 'idx_migration_history_version', on: 'version' },
      { name: 'idx_migration_history_name', on: 'name' },
    ];

    for (const idx of indexes) {
      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS ${idx.name}
        ON migration_history (${idx.on})
      `).catch(() => {});
    }
  }

  async checkLegacyTable() {
    const legacyCheck = await this.pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = '_sw_migrations'
      )
    `);

    if (legacyCheck.rows[0].exists) {
      console.warn(
        '[SchemaWeaver] Legacy table _sw_migrations detected. ' +
        'This table is deprecated. Migration history is now stored in migration_history.'
      );
    }
  }

  generateVersion() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const MM = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const HH = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    return `${yyyy}${MM}${dd}${HH}${mm}${ss}`;
  }

  computeChecksum(plan) {
    const canonical = JSON.stringify(
      plan.steps?.map(s => ({ sql: s.sql, id: s.id })) || []
    );
    return crypto.createHash('sha256').update(canonical).digest('hex');
  }

  generateUpSql(plan) {
    return plan.steps?.map(s => s.sql).filter(Boolean).join(';\n') || '';
  }

  getEngineVersion() {
    return ENGINE_VERSION;
  }

  mapExecutorStatus(executorStatus) {
    const STATUS_MAP = {
      'COMPLETED': 'completed',
      'completed': 'completed',
      'PARTIALLY_APPLIED': 'partially_applied',
      'partially_applied': 'partially_applied',
      'FAILED': 'failed',
      'failed': 'failed',
      'DRY_RUN_SUCCESS': 'completed',
      'dry_run_success': 'completed',
      'DRY_RUN_FAILURE': 'failed',
      'dry_run_failure': 'failed',
      'running': 'running',
      'pending': 'pending',
      'rolled_back': 'rolled_back',
    };
    return STATUS_MAP[executorStatus] || executorStatus?.toLowerCase() || 'failed';
  }

  async createRecord(plan, connectionId = null) {
    const cid = connectionId || this.connectionId;
    const version = this.generateVersion();
    const checksum = this.computeChecksum(plan);
    const upSql = this.generateUpSql(plan);

    const changes = plan.changes || plan.steps || [];
    const changeCount = changes.length;
    const createCount = changes.filter(c => c.changeType === 'CREATE').length;
    const alterCount = changes.filter(c => c.changeType === 'ALTER').length;
    const dropCount = changes.filter(c => c.changeType === 'DROP').length;
    const renameCount = changes.filter(c => c.changeType === 'RENAME').length;

    const result = await this.pool.query(`
      INSERT INTO migration_history (
        connection_id, version, name, checksum,
        up_sql, status, direction,
        schema_diff, sql_statements,
        risk_summary, warnings,
        change_count, create_count, alter_count, drop_count, rename_count,
        pg_version, engine_version,
        applied_at, created_at
      ) VALUES (
        $1, $2, $3, $4,
        $5, 'running', $6,
        $7, $8,
        $9, $10,
        $11, $12, $13, $14, $15,
        $16, $17,
        now(), now()
      )
      RETURNING id, version
    `, [
      cid,
      version,
      plan.name || `migration_${version}`,
      checksum,
      upSql,
      plan.direction || 'up',
      JSON.stringify(plan.schemaDiff || plan.diff || {}),
      JSON.stringify(plan.steps?.map(s => ({ stepId: s.id, sql: s.sql })) || []),
      JSON.stringify(plan.riskSummary || {}),
      JSON.stringify(plan.warnings || []),
      changeCount, createCount, alterCount, dropCount, renameCount,
      plan.pgVersion || null,
      this.getEngineVersion(),
    ]);

    return result.rows[0];
  }

  async updateStepProgress(recordId, stepId, status, durationMs) {
    await this.pool.query(`
      UPDATE migration_history
      SET execution_results = 
        COALESCE(execution_results, '{}'::jsonb) || 
        jsonb_build_object($1::text, jsonb_build_object(
          'status', $2,
          'duration_ms', $3,
          'completed_at', now()
        ))
      WHERE id = $4
    `, [stepId, status, durationMs, recordId]);
  }

  async completeRecord(recordId, execResult) {
    const status = this.mapExecutorStatus(execResult.status);
    const errorMessage = execResult.errors?.length > 0
      ? execResult.errors.map(e => `[${e.code || 'ERR'}] ${e.message}`).join('\n')
      : null;

    await this.pool.query(`
      UPDATE migration_history
      SET status = $1,
          execution_time_ms = $2,
          error_message = $3,
          execution_results = $4,
          snapshot_before = $5,
          snapshot_after = $6,
          rollback_sql = $7,
          applied_at = CASE WHEN $1 IN ('completed', 'partially_applied') THEN now() ELSE applied_at END
      WHERE id = $8
    `, [
      status,
      execResult.durationMs || execResult.duration,
      errorMessage,
      JSON.stringify(execResult.intents || execResult.executionResults || {}),
      JSON.stringify(execResult.snapshotBefore || execResult.snapshots?.before || null),
      JSON.stringify(execResult.snapshotAfter || execResult.snapshots?.after || null),
      JSON.stringify(execResult.rollbackSteps || []),
      recordId,
    ]);
  }

  async failRecord(recordId, error, executedSteps = []) {
    const errorMessage = error.message || String(error);
    const pgError = error.code ? `[${error.code}] ` : '';

    await this.pool.query(`
      UPDATE migration_history
      SET status = 'failed',
          error_message = $1,
          execution_results = $2
      WHERE id = $3
    `, [
      pgError + errorMessage,
      JSON.stringify({ executedSteps, error: { message: errorMessage, code: error.code } }),
      recordId,
    ]);
  }

  async markRolledBack(recordId, rolledBackBy = null) {
    await this.pool.query(`
      UPDATE migration_history
      SET status = 'rolled_back',
          rolled_back_at = now(),
          rolled_back_by = $1
      WHERE id = $2
    `, [rolledBackBy, recordId]);
  }

  async getHistory(connectionId = null, limit = 50, offset = 0) {
    const cid = connectionId || this.connectionId;
    const result = await this.pool.query(`
      SELECT id, version, name, status, direction,
             change_count, create_count, alter_count, drop_count, rename_count,
             execution_time_ms, error_message,
             applied_at, created_at, rolled_back_at
      FROM migration_history
      WHERE connection_id = $1
      ORDER BY applied_at DESC NULLS LAST
      LIMIT $2 OFFSET $3
    `, [cid, limit, offset]);
    return result.rows;
  }

  async getLastMigration(connectionId = null) {
    const cid = connectionId || this.connectionId;
    const result = await this.pool.query(`
      SELECT id, version, name, status, checksum, applied_at
      FROM migration_history
      WHERE connection_id = $1 AND status = 'completed'
      ORDER BY applied_at DESC
      LIMIT 1
    `, [cid]);
    return result.rows[0] || null;
  }

  async getMigration(recordId) {
    const result = await this.pool.query(`
      SELECT * FROM migration_history WHERE id = $1
    `, [recordId]);
    return result.rows[0] || null;
  }

  async getMigrationByVersion(connectionId = null, version) {
    const cid = connectionId || this.connectionId;
    const result = await this.pool.query(`
      SELECT * FROM migration_history
      WHERE connection_id = $1 AND version = $2
    `, [cid, version]);
    return result.rows[0] || null;
  }

  async getByStatus(connectionId = null, status) {
    const cid = connectionId || this.connectionId;
    const result = await this.pool.query(`
      SELECT * FROM migration_history
      WHERE connection_id = $1 AND status = $2
      ORDER BY created_at DESC
    `, [cid, status]);
    return result.rows;
  }

  async getRollbackSQL(recordId) {
    const result = await this.pool.query(`
      SELECT 
        id, name, schema_diff,
        rollback_sql, sql_statements,
        status, applied_at
      FROM migration_history
      WHERE id = $1
    `, [recordId]);
    return result.rows[0] || null;
  }

  async setRollbackSQL(recordId, rollbackSteps) {
    await this.pool.query(`
      UPDATE migration_history
      SET rollback_sql = $1
      WHERE id = $2
    `, [JSON.stringify(rollbackSteps), recordId]);
  }

  async getStats(connectionId = null) {
    const cid = connectionId || this.connectionId;
    const result = await this.pool.query(`
      SELECT
        COUNT(*) as total_migrations,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        COUNT(*) FILTER (WHERE status = 'rolled_back') as rolled_back,
        COUNT(*) FILTER (WHERE status = 'running') as running,
        COUNT(*) FILTER (WHERE status = 'partially_applied') as partially_applied,
        COALESCE(SUM(change_count), 0) as total_changes,
        COALESCE(SUM(execution_time_ms), 0) as total_execution_time_ms,
        MAX(applied_at) as last_migration_at
      FROM migration_history
      WHERE connection_id = $1
    `, [cid]);
    return result.rows[0];
  }

  async cleanupOldRecords(keepCount = 100, connectionId = null) {
    const cid = connectionId || this.connectionId;
    const result = await this.pool.query(`
      DELETE FROM migration_history
      WHERE id NOT IN (
        SELECT id FROM migration_history
        WHERE connection_id = $1
        ORDER BY applied_at DESC NULLS LAST
        LIMIT $2
      ) AND connection_id = $1
      RETURNING id
    `, [cid, keepCount]);
    return result.rowCount;
  }
}
