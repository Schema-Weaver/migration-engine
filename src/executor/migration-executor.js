import { TransactionManager } from './transaction-manager.js';
import { LockManager } from './lock-manager.js';
import { ProgressTracker } from './progress-tracker.js';
import { DriftDetector } from './drift-detector.js';
import { splitSqlStatements, sanitizeSavepointName } from './sql-splitter.js';
import {
  ExecutionError,
  PreCheckFailedError,
  MigrationConflictError,
  VersionIncompatibilityError,
  DriftDetectedError,
} from '../errors.js';
import {
  MIGRATION_STATUS,
  RISK_LEVELS,
  mapExecutorStatusToDb,
} from '../constants.js';

/**
 * Extract structured error information from a PostgreSQL error.
 * The pg driver puts all PG error fields on the Error object.
 */
export function extractPgError(error) {
  return {
    message: error.message || 'Unknown error',
    code: error.code || 'UNKNOWN',
    severity: error.severity || 'ERROR',
    detail: error.detail || null,
    hint: error.hint || null,
    schema: error.schema || null,
    table: error.table || null,
    column: error.column || null,
    datatype: error.datatype || null,
    constraint: error.constraint || null,
    position: error.position || null,
    where: error.where || null,
    isPgError: !!error.code && /^[0-9A-Z]{5}$/.test(error.code),
  };
}

/**
 * Classify PostgreSQL error code for recovery decisions.
 */
export function classifyPgError(errorCode) {
  if (!errorCode || typeof errorCode !== 'string') {
    return { category: 'unknown', recoverable: false, action: 'abort' };
  }

  const prefix = errorCode.substring(0, 2);

  const CLASSIFICATION = {
    '42': {
      '42P01': { category: 'undefined_object', recoverable: false, action: 'skip_if_drop' },
      '42P07': { category: 'duplicate_object', recoverable: false, action: 'skip' },
      '42P06': { category: 'duplicate_schema', recoverable: false, action: 'skip' },
      '42701': { category: 'duplicate_column', recoverable: false, action: 'skip' },
      '42710': { category: 'duplicate_object', recoverable: false, action: 'skip' },
      '42723': { category: 'duplicate_function', recoverable: false, action: 'skip' },
      '42P16': { category: 'invalid_schema', recoverable: false, action: 'abort' },
      '42P09': { category: 'ambiguous_alias', recoverable: false, action: 'abort' },
      '42501': { category: 'insufficient_privilege', recoverable: false, action: 'abort' },
      'default': { category: 'syntax_or_access', recoverable: false, action: 'abort' },
    },
    '23': {
      '23505': { category: 'unique_violation', recoverable: false, action: 'abort' },
      '23503': { category: 'foreign_key_violation', recoverable: false, action: 'abort' },
      '23514': { category: 'check_violation', recoverable: false, action: 'abort' },
      '23502': { category: 'not_null_violation', recoverable: false, action: 'abort' },
      'default': { category: 'integrity', recoverable: false, action: 'abort' },
    },
    '53': {
      '53100': { category: 'disk_full', recoverable: false, action: 'abort' },
      '54000': { category: 'too_many_columns', recoverable: false, action: 'abort' },
      'default': { category: 'insufficient_resources', recoverable: false, action: 'abort' },
    },
    '54': { category: 'program_limit', recoverable: false, action: 'abort' },
    '58': { category: 'system_error', recoverable: true, action: 'retry' },
    '40': {
      '40001': { category: 'serialization_failure', recoverable: true, action: 'retry' },
      '40P01': { category: 'deadlock', recoverable: true, action: 'retry' },
      'default': { category: 'tx_integrity', recoverable: false, action: 'abort' },
    },
    '55': {
      '55006': { category: 'object_in_use', recoverable: true, action: 'wait_retry' },
      'default': { category: 'object_not_prerequisite', recoverable: false, action: 'abort' },
    },
    '57': {
      '57P03': { category: 'cannot_connect_now', recoverable: true, action: 'wait_retry' },
      '57P04': { category: 'database_dropped', recoverable: false, action: 'abort' },
      'default': { category: 'lock_not_available', recoverable: true, action: 'wait_retry' },
    },
    '25': {
      '25P02': { category: 'in_failed_tx', recoverable: false, action: 'abort' },
      'default': { category: 'invalid_tx_state', recoverable: false, action: 'abort' },
    },
    '08': { category: 'connection_error', recoverable: true, action: 'retry' },
    '0A': { category: 'feature_not_supported', recoverable: false, action: 'abort' },
    '0B': { category: 'invalid_tx_init', recoverable: false, action: 'abort' },
    'F0': { category: 'config_error', recoverable: false, action: 'abort' },
    'HV': { category: 'fdw_error', recoverable: false, action: 'abort' },
    'P0': { category: 'plpgsql_error', recoverable: false, action: 'abort' },
    'XX': { category: 'internal_error', recoverable: false, action: 'abort' },
  };

  const prefixLookup = CLASSIFICATION[prefix];
  if (prefixLookup) {
    if (typeof prefixLookup === 'object') {
      const fullCodeLookup = prefixLookup[errorCode];
      if (fullCodeLookup) {
        return fullCodeLookup;
      }
      if (prefixLookup.default) {
        return prefixLookup.default;
      }
    }
    return prefixLookup;
  }

  return { category: 'unknown', recoverable: false, action: 'abort' };
}

/**
 * Detect SQL statements that cannot run inside a transaction.
 */
export function isNonTransactionalSQL(sql, step = {}) {
  if (step.isTransactional === false) return true;
  if (step.isConcurrent === true) return true;

  if (!sql || typeof sql !== 'string') return false;

  const normalizedSql = sql.trim().toUpperCase();

  if (/\b(CREATE|DROP|REINDEX)\s+INDEX\s+CONCURRENTLY\b/i.test(sql)) {
    return true;
  }

  if (/\bALTER\s+TYPE\s+.*\bADD\s+VALUE\b/i.test(sql)) {
    if (step.pgVersion && parseFloat(step.pgVersion) >= 12) {
      return false;
    }
    return true;
  }

  if (/\bVACUUM\b/i.test(normalizedSql) &&
      !normalizedSql.includes('ANALYZE') &&
      !normalizedSql.startsWith('ANALYZE')) {
    return true;
  }

  if (/\bCLUSTER\b/i.test(normalizedSql) && !/\bCLUSTERED\b/.test(normalizedSql)) {
    return true;
  }

  return false;
}

/**
 * Detect PostgreSQL server version.
 */
async function detectPgVersion(pool) {
  try {
    const result = await pool.query('SELECT version()');
    const versionString = result.rows[0].version;
    const match = versionString.match(/PostgreSQL\s+(\d+)(?:\.(\d+))?/);
    if (match) {
      return `${match[1]}.${match[2] || '0'}`;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * @typedef {Object} ExecutionConfig
 * @property {boolean} [dryRun=false]
 * @property {number} [timeout=300000]
 * @property {boolean} [continueOnError=false]
 * @property {boolean} [snapshotBefore=true]
 * @property {boolean} [verifyAfter=true]
 * @property {string} [lockTimeout='5s']
 * @property {string} [statementTimeout='30s']
 * @property {number} [lockKey] - Advisory lock key
 */

export class MigrationExecutor {
  pgVersion = null;
  connectionId = null;

  /**
   * @param {import('pg').Pool} pool
   * @param {import('../introspection/index.js').Introspector} introspector
   * @param {import('../storage/migration-table.js').MigrationTable} storage
   * @param {ExecutionConfig} [config]
   */
  constructor(pool, introspector, storage, config = {}) {
    this.pool = pool;
    this.introspector = introspector;
    this.storage = storage;
    this.connectionId = config.connectionId || null;

    if (!this.connectionId) {
      console.warn(
        '[MigrationExecutor] No connectionId provided. ' +
        'Migrations will not be scoped to a database and will use fallback lock key.'
      );
    }

    this.config = {
      dryRun: config.dryRun || false,
      timeout: config.timeout || 300000,
      continueOnError: config.continueOnError || false,
      snapshotBefore: config.snapshotBefore !== false,
      verifyAfter: config.verifyAfter !== false,
      lockTimeout: config.lockTimeout || '5s',
      statementTimeout: config.statementTimeout || '30s',
      lockHeartbeatInterval: config.lockHeartbeatInterval || 30000,
      continueOnLockLoss: config.continueOnLockLoss || false,
    };

    this.txManager = new TransactionManager(pool);
    this.lockManager = new LockManager(pool, { connectionId: this.connectionId });
    this.progressTracker = new ProgressTracker();
    this.driftDetector = new DriftDetector();

    this.state = 'idle';
    this.executedSteps = [];
    this.intents = [];
    this.snapshots = { before: null, after: null };
    this.migrationRecord = null;
    this._heartbeatTimer = null;
  }

  /**
   * Execute a migration plan
   * @param {import('../types/migration.js').MigrationPlan} plan
   * @param {import('../types/execution.js').ExecutionOptions} [options]
   * @returns {Promise<import('../types/migration.js').MigrationResult>}
   */
  async execute(plan, options = {}) {
    const startTime = Date.now();
    const connectionId = options.connectionId || this.connectionId;
    const mergedConfig = { ...this.config, ...options, connectionId };

    const result = {
      migrationId: null,
      status: MIGRATION_STATUS.RUNNING,
      stepsCompleted: 0,
      stepsSkipped: 0,
      stepsFailed: 0,
      stepsTotal: plan.steps?.length || 0,
      success: true,
      errors: [],
      warnings: [],
      intents: [],
      startedAt: new Date(startTime).toISOString(),
      connectionId,
    };

    try {
      this.state = 'running';
      this.intents = [];

      this.emitProgress({ type: 'execution_start', planId: plan.id, timestamp: new Date().toISOString(), connectionId });

      this.pgVersion = await detectPgVersion(this.pool);

      await this.preflightCheck(plan, mergedConfig);

      const lockKey = this.lockManager.computeLockKey(connectionId);
      await this.acquireAdvisoryLock({ ...mergedConfig, lockKey });
      this._startLockHeartbeat({ ...mergedConfig, lockKey });

      if (mergedConfig.snapshotBefore) {
        this.snapshots.before = await this.captureSnapshot();
      }

      this.migrationRecord = await this.storage.createRecord(plan, connectionId);
      result.migrationId = this.migrationRecord?.id || this.migrationRecord?.migration_id || plan.id;

      const detectedSteps = this._detectNonTransactionalSteps(plan.steps || [], result);
      const phases = this.groupStepsByPhase(detectedSteps);
      const phaseOrder = Object.keys(phases).map(Number).sort((a, b) => a - b);

      for (const phaseNum of phaseOrder) {
        const phaseSteps = phases[phaseNum];
        await this.executePhase(phaseNum, phaseSteps, mergedConfig, result);
      }

      if (result.stepsFailed === 0) {
        result.status = mergedConfig.dryRun ? MIGRATION_STATUS.DRY_RUN_SUCCESS : MIGRATION_STATUS.COMPLETED;
        result.success = true;
      } else if (mergedConfig.continueOnError && result.stepsCompleted > 0) {
        result.status = mergedConfig.dryRun ? MIGRATION_STATUS.DRY_RUN_FAILURE : MIGRATION_STATUS.PARTIALLY_APPLIED;
        result.success = false;
      } else {
        result.status = mergedConfig.dryRun ? MIGRATION_STATUS.DRY_RUN_FAILURE : MIGRATION_STATUS.FAILED;
        result.success = false;
      }

      if (mergedConfig.verifyAfter && !mergedConfig.dryRun) {
        await this.postflightVerify(plan, mergedConfig);
      }

      if (mergedConfig.snapshotBefore && !mergedConfig.dryRun) {
        this.snapshots.after = await this.captureSnapshot();
      }

      await this.completeMigrationRecord();

      this._stopLockHeartbeat();
      await this.releaseAdvisoryLock();

      this.state = 'completed';

      return this.buildResult(plan, result.status.toLowerCase(), startTime, result);

    } catch (error) {
      this.state = 'failed';
      this._stopLockHeartbeat();
      const recoveryInfo = await this.handleFailure(error, plan);
      result.status = 'FAILED';
      result.success = false;
      result.errors.push({
        message: error.message,
        code: error.code || 'UNKNOWN',
        recovery: recoveryInfo,
      });
      throw new ExecutionError(
        `Migration failed: ${error.message}`,
        { cause: error, recovery: recoveryInfo, result }
      );
    }
  }

  /**
   * Detect and fix non-transactional step classification
   */
  _detectNonTransactionalSteps(steps, result) {
    return steps.map(step => {
      const detectedNonTx = isNonTransactionalSQL(step.sql || '', { ...step, pgVersion: step.pgVersion || this.pgVersion });

      if (detectedNonTx && step.isTransactional !== false) {
        result.warnings.push({
          step: step.id,
          message: `Step was marked as transactional but contains non-transactional SQL. Automatically moved to non-transactional execution.`,
          severity: 'high',
        });
        return { ...step, isTransactional: false };
      }

      if (!detectedNonTx && step.isTransactional === false) {
        result.warnings.push({
          step: step.id,
          message: `Step is marked non-transactional but SQL appears transaction-safe.`,
          severity: 'low',
        });
      }

      return step;
    });
  }

  /**
   * Start lock heartbeat timer
   */
  _startLockHeartbeat(config) {
    this._stopLockHeartbeat();
    if (config.lockHeartbeatInterval > 0) {
      this._heartbeatTimer = setInterval(async () => {
        try {
          const lockInfo = this.lockManager.isHeldBySelf(config.lockKey || this.lockManager.lockId);
          if (!lockInfo) {
            this.emitProgress({
              type: 'warning',
              message: 'Advisory lock lost during migration. Another migration may be running.',
              severity: 'critical',
            });
          }
        } catch {
          // Ignore heartbeat check errors
        }
      }, config.lockHeartbeatInterval);
    }
  }

  /**
   * Stop lock heartbeat timer
   */
  _stopLockHeartbeat() {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
  }

  /**
   * Record step intent before execution
   */
  _recordIntent(step, status = 'INTENT') {
    const intent = {
      stepId: step.id,
      phase: step.phase,
      changeType: step.changeType,
      objectType: step.objectType,
      objectKey: step.objectKey,
      objectName: step.objectName,
      sql: step.sql,
      isTransactional: step.isTransactional !== false,
      preCheck: step.preCheck || false,
      recoverySql: step.recoverySql || null,
      undoSql: step.undoSql || step.rollbackSql || null,
      recordedAt: new Date().toISOString(),
      status,
    };
    this.intents.push(intent);
    return intent;
  }

  /**
   * Update intent after execution
   */
  _updateIntent(intent, updates) {
    Object.assign(intent, updates);
    return intent;
  }

  /**
   * Group steps by their phase number
   * @param {Array} steps
   * @returns {Object<number, Array>}
   */
  groupStepsByPhase(steps) {
    const phases = {};
    for (const step of steps) {
      const phase = step.phase || 10;
      if (!phases[phase]) phases[phase] = [];
      phases[phase].push(step);
    }
    return phases;
  }

  /**
   * Execute all steps in a phase
   * @param {number} phaseNum
   * @param {Array} steps
   * @param {ExecutionConfig} config
   * @param {Object} result
   */
  async executePhase(phaseNum, steps, config, result) {
    const phaseName = this.getPhaseName(phaseNum);

    this.emitProgress({
      type: 'phase_start',
      phase: phaseNum,
      phaseName,
      stepCount: steps.length,
    });

    const transactional = steps.filter(s => s.isTransactional !== false);
    const nonTransactional = steps.filter(s => s.isTransactional === false);

    if (transactional.length > 0) {
      await this.executeInTransaction(transactional, phaseNum, config, result);
    }

    for (const step of nonTransactional) {
      await this.executeNonTransactionalStep(step, phaseNum, config, result);
    }

    this.emitProgress({
      type: 'phase_complete',
      phase: phaseNum,
      phaseName,
    });
  }

  /**
   * Execute transactional steps in a single transaction
   * @param {Array} steps
   * @param {number} phaseNum
   * @param {ExecutionConfig} config
   * @param {Object} result
   */
  async executeInTransaction(steps, phaseNum, config, result) {
    const phaseName = this.getPhaseName(phaseNum);
    const client = await this.pool.connect();

    const stepsCompleted = [];
    const stepsFailed = [];
    const stepsSkipped = [];

    try {
      await client.query('BEGIN');

      await client.query(`SET LOCAL lock_timeout = '${config.lockTimeout}'`);
      await client.query(`SET LOCAL statement_timeout = '${config.statementTimeout}'`);
      await client.query(`SET LOCAL search_path = 'public'`);

      for (const step of steps) {
        const savepointName = `sp_${sanitizeSavepointName(step.id)}`;
        const intent = this._recordIntent(step, 'INTENT');
        result.intents.push(intent);

        try {
          await client.query(`SAVEPOINT ${savepointName}`);

          await this.executeStepWithRetry(client, step, phaseNum, phaseName, config);

          await client.query(`RELEASE SAVEPOINT ${savepointName}`);
          stepsCompleted.push(step);

          this._updateIntent(intent, {
            status: 'COMPLETED',
            completedAt: new Date().toISOString(),
            durationMs: Date.now() - new Date(intent.recordedAt).getTime(),
          });

          result.stepsCompleted++;

        } catch (error) {
          await client.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
          await client.query(`RELEASE SAVEPOINT ${savepointName}`);

          const pgError = extractPgError(error);
          const classification = classifyPgError(pgError.code);

          const isDropStep = step.changeType === 'DROP';
          const shouldSkipDuplicate = classification.action === 'skip';
          const shouldSkipIfDrop = classification.action === 'skip_if_drop' && isDropStep;

          if (shouldSkipDuplicate || shouldSkipIfDrop) {
            stepsSkipped.push({ step, reason: classification.category });

            this._updateIntent(intent, {
              status: 'SKIPPED',
              completedAt: new Date().toISOString(),
              skipReason: classification.category,
              pgCode: pgError.code,
            });

            result.warnings.push({
              step: step.id,
              message: `Skipped: ${pgError.message} (${pgError.code})`,
              severity: 'low',
              pgCode: pgError.code,
            });
            result.stepsSkipped++;
            continue;
          }

          stepsFailed.push({ step, error, pgError, classification });

          this._updateIntent(intent, {
            status: 'FAILED',
            completedAt: new Date().toISOString(),
            durationMs: Date.now() - new Date(intent.recordedAt).getTime(),
            errorCode: pgError.code,
            errorMessage: pgError.message,
          });

          result.stepsFailed++;
          result.errors.push({
            step: step.id,
            sql: step.sql,
            message: pgError.message,
            code: pgError.code,
            severity: pgError.severity,
            detail: pgError.detail,
            hint: pgError.hint,
            schema: pgError.schema,
            table: pgError.table,
            column: pgError.column,
            constraint: pgError.constraint,
            classification: classification.category,
            isNonTransactional: false,
          });

          this.executedSteps.push({
            stepId: step.id,
            sql: step.sql,
            phase: phaseNum,
            status: 'failed',
            error: error.message,
            errorCode: pgError.code,
            timestamp: new Date().toISOString(),
          });

          if (!config.continueOnError) {
            await client.query('ROLLBACK');
            throw new ExecutionError(
              `Phase "${phaseName}" failed at step "${step.id}": ${error.message}`,
              { phase: { number: phaseNum, name: phaseName }, step, cause: error, pgError }
            );
          }

          result.warnings.push({
            step: step.id,
            message: `Step failed but continuing: ${pgError.message} (${pgError.code})`,
            severity: 'medium',
            pgCode: pgError.code,
          });
        }
      }

      if (config.dryRun) {
        await client.query('ROLLBACK');
        this.emitProgress({
          type: 'dry_run_rollback',
          phase: phaseNum,
          phaseName,
          stepsRolledBack: stepsCompleted.length,
        });
      } else {
        await client.query('COMMIT');
      }

    } catch (error) {
      if (error instanceof ExecutionError) {
        throw error;
      }
      await client.query('ROLLBACK').catch(() => {});
      throw new ExecutionError(
        `Phase "${phaseName}" failed: ${error.message}`,
        { phase: { number: phaseNum, name: phaseName }, cause: error }
      );
    } finally {
      client.release();
    }

    if (stepsFailed.length > 0 && config.continueOnError) {
      this.emitProgress({
        type: 'partial_completion',
        phase: phaseNum,
        phaseName,
        stepsCompleted: stepsCompleted.length,
        stepsFailed: stepsFailed.length,
        stepsSkipped: stepsSkipped.length,
      });
    }
  }

  /**
   * Execute a step with retry on transient errors
   */
  async executeStepWithRetry(client, step, phaseNum, phaseName, config, maxRetries = 2) {
    let lastError;
    let attempts = 0;

    while (attempts <= maxRetries) {
      try {
        await this.executeStep(client, step, phaseNum, phaseName, config);
        return;
      } catch (error) {
        lastError = error;
        const pgError = extractPgError(error);
        const classification = classifyPgError(pgError.code);

        if (classification.action === 'retry' && attempts < maxRetries) {
          attempts++;
          await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
          continue;
        }

        if (classification.action === 'wait_retry' && attempts < maxRetries) {
          attempts++;
          await new Promise(resolve => setTimeout(resolve, 3000 * attempts));
          continue;
        }

        throw error;
      }
    }

    throw lastError;
  }

  /**
   * Execute a single non-transactional step
   * @param {Object} step
   * @param {number} phaseNum
   * @param {ExecutionConfig} config
   * @param {Object} result
   */
  async executeNonTransactionalStep(step, phaseNum, config, result) {
    const phaseName = this.getPhaseName(phaseNum);

    const intent = this._recordIntent(step, 'INTENT');
    result.intents.push(intent);

    if (config.dryRun) {
      this._updateIntent(intent, {
        status: 'SKIPPED',
        completedAt: new Date().toISOString(),
        skipReason: 'dry_run',
      });
      result.stepsSkipped++;

      this.emitProgress({
        type: 'dry_run_skip',
        phase: phaseNum,
        phaseName,
        stepId: step.id,
        sql: step.sql,
        reason: 'Non-transactional DDL skipped in dry run (cannot rollback)',
      });
      return;
    }

    const client = await this.pool.connect();

    try {
      await client.query(`SET statement_timeout = '${config.statementTimeout}'`);

      const statements = splitSqlStatements(step.sql);

      if (statements.length > 1) {
        result.warnings.push({
          step: step.id,
          message: 'Non-transactional step contains multiple statements; only first will be executed',
          severity: 'medium',
        });
      }

      const sqlToExecute = statements.length > 0 ? statements[0] : step.sql;
      const startTime = Date.now();
      const queryResult = await client.query(sqlToExecute);
      const duration = Date.now() - startTime;

      this.executedSteps.push({
        stepId: step.id,
        sql: step.sql,
        phase: phaseNum,
        status: 'completed',
        duration,
        rowsAffected: queryResult.rowCount,
        timestamp: new Date().toISOString(),
        isTransactional: false,
      });

      this._updateIntent(intent, {
        status: 'COMPLETED',
        completedAt: new Date().toISOString(),
        durationMs: duration,
      });

      result.stepsCompleted++;

      this.emitProgress({
        type: 'step_completed',
        phase: phaseNum,
        phaseName,
        stepId: step.id,
        sql: step.sql,
        duration,
        rowsAffected: queryResult.rowCount,
        isNonTransactional: true,
      });

    } catch (error) {
      const pgError = extractPgError(error);
      const classification = classifyPgError(pgError.code);

      this._updateIntent(intent, {
        status: 'FAILED',
        completedAt: new Date().toISOString(),
        errorCode: pgError.code,
        errorMessage: pgError.message,
      });

      result.stepsFailed++;
      result.errors.push({
        step: step.id,
        sql: step.sql,
        message: pgError.message,
        code: pgError.code,
        severity: pgError.severity,
        detail: pgError.detail,
        hint: pgError.hint,
        classification: classification.category,
        isNonTransactional: true,
        recoveryHint: step.recoverySql || `Manual recovery may be required`,
      });

      this.executedSteps.push({
        stepId: step.id,
        sql: step.sql,
        phase: phaseNum,
        status: 'failed',
        error: error.message,
        errorCode: pgError.code,
        isTransactional: false,
        timestamp: new Date().toISOString(),
        recoveryHint: step.recoverySql || null,
      });

      if (!config.continueOnError) {
        throw new ExecutionError(
          `Non-transactional step "${step.id}" failed: ${error.message}`,
          { phase: { number: phaseNum, name: phaseName }, step, cause: error, isNonTransactional: true, pgError }
        );
      }

      result.warnings.push({
        step: step.id,
        message: `Non-tx step failed: ${pgError.message} (${pgError.code})`,
        severity: 'high',
        pgCode: pgError.code,
      });
    } finally {
      client.release();
    }
  }

  /**
   * Execute a single step
   * @param {import('pg').PoolClient} client
   * @param {Object} step
   * @param {number} phaseNum
   * @param {string} phaseName
   * @param {ExecutionConfig} config
   */
  async executeStep(client, step, phaseNum, phaseName, config) {
    if (step.preCheck) {
      const preCheckResult = await client.query(step.preCheck);
      if (step.preCheckExpectEmpty && preCheckResult.rows.length > 0) {
        throw new PreCheckFailedError(
          `Pre-check failed for step ${step.id}: ${step.preCheckMessage || 'Condition not met'}`,
          { step, preCheckResult }
        );
      }
    }

    const statements = splitSqlStatements(step.sql);
    
    if (statements.length === 0) {
      this.executedSteps.push({
        stepId: step.id,
        sql: step.sql,
        phase: phaseNum,
        phaseName,
        status: 'completed',
        duration: 0,
        rowsAffected: 0,
        timestamp: new Date().toISOString(),
        isTransactional: step.isTransactional !== false,
      });
      return;
    }

    if (statements.length === 1) {
      await this._executeSingleStatement(client, statements[0], step, phaseNum, phaseName);
      return;
    }

    const subResults = [];
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      const subSavepointName = `sp_${sanitizeSavepointName(step.id)}_stmt_${i}`;
      
      try {
        await client.query(`SAVEPOINT ${subSavepointName}`);
        
        const result = await this._executeSingleStatement(client, stmt, step, phaseNum, phaseName, true);
        subResults.push(result);
        
        await client.query(`RELEASE SAVEPOINT ${subSavepointName}`);
        
      } catch (error) {
        await client.query(`ROLLBACK TO SAVEPOINT ${subSavepointName}`);
        await client.query(`RELEASE SAVEPOINT ${subSavepointName}`);
        
        error.subStatementIndex = i;
        error.subStatementSql = stmt;
        throw error;
      }
    }

    this.emitProgress({
      type: 'step_completed',
      phase: phaseNum,
      phaseName,
      stepId: step.id,
      sql: step.sql,
      duration: subResults.reduce((sum, r) => sum + r.duration, 0),
      rowsAffected: subResults.reduce((sum, r) => sum + r.rowsAffected, 0),
      subStatements: statements.length,
    });
  }

  async _executeSingleStatement(client, sql, step, phaseNum, phaseName, isSubStatement = false) {
    const startTime = Date.now();
    const result = await client.query(sql);
    const duration = Date.now() - startTime;

    if (!isSubStatement) {
      this.executedSteps.push({
        stepId: step.id,
        sql: step.sql,
        phase: phaseNum,
        phaseName,
        status: 'completed',
        duration,
        rowsAffected: result.rowCount,
        timestamp: new Date().toISOString(),
        isTransactional: step.isTransactional !== false,
      });

      if (this.migrationRecord?.id) {
        await this.storage.updateStepProgress(
          this.migrationRecord.migration_id,
          step.id,
          'completed',
          duration
        );
      }

      this.emitProgress({
        type: 'step_completed',
        phase: phaseNum,
        phaseName,
        stepId: step.id,
        sql: step.sql,
        duration,
        rowsAffected: result.rowCount,
      });

      if (step.postCheck) {
        await client.query(step.postCheck);
      }
    }

    return {
      success: true,
      rowsAffected: result.rowCount || 0,
      duration,
    };
  }

  /**
   * Pre-flight checks before execution
   * @param {import('../types/migration.js').MigrationPlan} plan
   * @param {ExecutionConfig} config
   */
  async preflightCheck(plan, config) {
    await this.pool.query('SELECT 1');

    const versionResult = await this.pool.query('SHOW server_version_num');
    const version = parseInt(versionResult.rows[0].server_version_num);

    for (const step of plan.steps) {
      if (step.pgVersionMinimum && version < step.pgVersionMinimum * 10000) {
        throw new VersionIncompatibilityError(
          `Step "${step.id}" requires PG ${step.pgVersionMinimum}+ but database is PG ${Math.floor(version / 10000)}`,
          { requiredVersion: step.pgVersionMinimum, currentVersion: Math.floor(version / 10000) }
        );
      }
    }

    const longQueries = await this.pool.query(`
      SELECT pid, now() - pg_stat_activity.query_start AS duration, query
      FROM pg_stat_activity
      WHERE state = 'active'
        AND now() - query_start > interval '30 seconds'
        AND pid != pg_backend_pid()
    `);
    if (longQueries.rows.length > 0) {
      this.emitProgress({
        type: 'warning',
        message: `${longQueries.rows.length} long-running queries detected. Migration may be blocked.`,
        queries: longQueries.rows,
        connectionId: config.connectionId,
      });
    }

    await this.storage.ensureTable();
  }

  /**
   * Acquire advisory lock
   * @param {ExecutionConfig} config
   */
  async acquireAdvisoryLock(config) {
    const lockKey = config.lockKey || this.lockManager.computeLockKey(config.connectionId);
    const acquired = await this.lockManager.acquire(lockKey, config.lockTimeout);
    if (!acquired) {
      throw new MigrationConflictError(
        'Failed to acquire migration lock. Another migration may be in progress.'
      );
    }
    this.emitProgress({ type: 'lock_acquired', lockKey, connectionId: config.connectionId });
  }

  /**
   * Release advisory lock
   */
  async releaseAdvisoryLock() {
    await this.lockManager.release().catch(() => {});
    this.emitProgress({ type: 'lock_released', lockKey: this.lockManager.lockId, connectionId: this.connectionId });
  }

  /**
   * Post-flight verification
   * @param {import('../types/migration.js').MigrationPlan} plan
   * @param {ExecutionConfig} config
   */
  async postflightVerify(plan, config) {
    if (this.snapshots.before && this.snapshots.after) {
      const drift = this.driftDetector.detect(
        this.snapshots.before,
        this.snapshots.after,
        { changes: this.executedSteps }
      );

      if (drift.detected) {
        throw new DriftDetectedError(
          'Schema drift detected during migration execution',
          { drift }
        );
      }
    }
  }

  /**
   * Capture a snapshot of current database state
   * @returns {Promise<Object>}
   */
  async captureSnapshot() {
    const result = await this.pool.query(`
      SELECT
        c.oid,
        n.nspname as schema,
        c.relname as name,
        c.relkind as kind,
        md5(n.nspname || '.' || c.relname || '.' || c.relkind) as checksum
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
        AND n.nspname NOT LIKE 'pg_temp_%'
      ORDER BY n.nspname, c.relname
    `);

    return {
      timestamp: new Date().toISOString(),
      objectCount: result.rows.length,
      checksums: result.rows.map(r => ({
        schema: r.schema,
        name: r.name,
        kind: r.kind,
        checksum: r.checksum,
      })),
    };
  }

  /**
   * Handle execution failure
   * @param {Error} error
   * @param {import('../types/migration.js').MigrationPlan} plan
   * @returns {Promise<Object>}
   */
  async handleFailure(error, plan) {
    const executedPhaseNames = [...new Set(
      this.executedSteps.filter(s => s.status === 'completed').map(s => this.getPhaseName(s.phase))
    )];

    const nonTransactionalExecuted = this.executedSteps.filter(
      s => s.status === 'completed' && s.isTransactional === false
    );

    if (this.migrationRecord?.migration_id) {
      await this.storage.failRecord(
        this.migrationRecord.migration_id,
        error,
        this.executedSteps
      );
    }

    await this.releaseAdvisoryLock();

    return {
      state: 'failed',
      error: error.message,
      executedPhases: executedPhaseNames,
      nonTransactionalExecuted: nonTransactionalExecuted.map(s => ({
        stepId: s.stepId,
        sql: s.sql,
      })),
      rollbackStatus: nonTransactionalExecuted.length > 0 ? 'PARTIAL' : 'FULL',
      manualRecoveryRequired: nonTransactionalExecuted.length > 0,
      recoverySQL: nonTransactionalExecuted.map(s => this.generateUndoSQL(s)).filter(Boolean),
    };
  }

  /**
   * Generate undo SQL for an executed step
   * @param {Object} executedStep
   * @returns {string|null}
   */
  generateUndoSQL(executedStep) {
    const sql = executedStep.sql?.toUpperCase().trim();
    if (!sql) return null;

    if (sql.startsWith('CREATE INDEX CONCURRENTLY')) {
      const match = executedStep.sql.match(/CREATE INDEX CONCURRENTLY\s+(?:IF NOT EXISTS\s+)?(?:(\w+)\.)?(\w+)/i);
      if (match) {
        return `DROP INDEX IF EXISTS ${match[1] ? match[1] + '.' : ''}${match[2]}`;
      }
    }

    return null;
  }

  /**
   * Complete the migration record
   */
  async completeMigrationRecord() {
    if (this.migrationRecord?.migration_id) {
      await this.storage.completeRecord(
        this.migrationRecord.migration_id,
        {
          duration: this.executedSteps.reduce((sum, s) => sum + (s.duration || 0), 0),
          snapshotBefore: this.snapshots.before,
          snapshotAfter: this.snapshots.after,
          executionResults: this.executedSteps,
          changeCount: this.executedSteps.filter(s => s.status === 'completed').length,
        }
      );
    }
  }

  /**
   * Build execution result
   * @param {import('../types/migration.js').MigrationPlan} plan
   * @param {string} status
   * @param {number} startTime
   * @param {Object} [resultObj]
   * @returns {import('../types/migration.js').MigrationResult}
   */
  buildResult(plan, status, startTime, resultObj = {}) {
    const completed = this.executedSteps.filter(s => s.status === 'completed');
    const failed = this.executedSteps.filter(s => s.status === 'failed');

    return {
      success: resultObj.success !== undefined ? resultObj.success : (status === 'completed' && failed.length === 0),
      migrationId: resultObj.migrationId || this.migrationRecord?.migration_id || plan.id,
      status: resultObj.status || status,
      startedAt: new Date(startTime).toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      stepsCompleted: resultObj.stepsCompleted ?? completed.length,
      stepsSkipped: resultObj.stepsSkipped ?? 0,
      stepsTotal: plan.steps?.length || 0,
      stepsFailed: resultObj.stepsFailed ?? failed.length,
      changesApplied: completed.length,
      snapshots: {
        before: this.snapshots.before?.objectCount || 0,
        after: this.snapshots.after?.objectCount || 0,
      },
      executedSteps: this.executedSteps,
      warnings: resultObj.warnings || [],
      errors: resultObj.errors?.length > 0 ? resultObj.errors : failed.map(s => ({
        step: s.stepId,
        sql: s.sql,
        message: s.error,
        code: s.errorCode,
        subStatementIndex: s.subStatementIndex,
        subStatementSql: s.subStatementSql,
        isNonTransactional: s.isTransactional === false,
        recoveryHint: s.recoveryHint,
      })),
      intents: resultObj.intents || [],
      state: {
        name: this.state,
        executedPhaseCount: [...new Set(this.executedSteps.map(s => s.phase))].length,
        failed: failed.length > 0,
      },
      pgVersion: this.pgVersion,
    };
  }

  /**
   * Get phase name from number
   * @param {number} phase
   * @returns {string}
   */
  getPhaseName(phase) {
    const phases = {
      1: 'pre_check',
      2: 'advisory_lock',
      3: 'extensions',
      4: 'types',
      5: 'schemas',
      6: 'tables_create',
      7: 'columns_add',
      8: 'sequences',
      9: 'indexes_create',
      10: 'constraints_non_fk',
      11: 'data_migration',
      12: 'constraints_fk',
      13: 'validate_constraints',
      14: 'views',
      15: 'materialized_views',
      16: 'functions',
      17: 'triggers',
      18: 'policies',
      19: 'rules',
      20: 'behavioral_other',
      21: 'grants',
      22: 'comments',
      23: 'indexes_concurrent',
      24: 'cleanup',
      25: 'post_check',
      26: 'snapshot',
    };
    return phases[phase] || `phase_${phase}`;
  }

  /**
   * Subscribe to progress events
   * @param {Function} listener
   * @returns {Function} Unsubscribe function
   */
  onProgress(listener) {
    return this.progressTracker.subscribe(listener);
  }

  /**
   * Emit progress event
   * @param {Object} event
   */
  emitProgress(event) {
    this.progressTracker.emit({
      ...event,
      timestamp: event.timestamp || new Date().toISOString(),
      state: this.state,
      executedStepCount: this.executedSteps.length,
    });
  }

  /**
   * Dry run a migration plan
   * @param {import('../types/migration.js').MigrationPlan} plan
   * @param {import('../types/execution.js').ExecutionOptions} [options]
   * @returns {Promise<import('../types/migration.js').MigrationResult>}
   */
  async dryRun(plan, options = {}) {
    return this.execute(plan, { ...options, dryRun: true });
  }
}
