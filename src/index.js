import { SchemaIntrospector } from './introspection/index.js';
import { SchemaDiffer } from './differ/index.js';
import { MigrationPlanner } from './planner/index.js';
import { MigrationExecutor } from './executor/migration-executor.js';
import { TransactionManager } from './executor/transaction-manager.js';
import { MigrationTable } from './storage/migration-table.js';
import { RollbackGenerator } from './storage/rollback-generator.js';
import { BehavioralExtractor } from './behavioral/behavioral-extractor.js';
import { BehavioralApplier } from './behavioral/behavioral-applier.js';
import { DdlGenerator } from './ddl-generator/index.js';
import { RiskEngine } from './risk/index.js';
import { InMemoryStorageProvider } from './storage/index.js';
import {
  MigrationError,
  ExecutionError,
  IntrospectionError,
  DiffError,
  DDLGenerationError,
  PreCheckFailedError,
  PostCheckFailedError,
  MigrationConflictError,
  VersionIncompatibilityError,
  RollbackError,
  DriftDetectedError,
  LockAcquisitionError,
  TimeoutError,
  ValidationError,
  StorageError,
  PlanBlockedError,
  RecoveryError,
} from './errors.js';

export {
  SchemaIntrospector,
  SchemaDiffer,
  DdlGenerator,
  RiskEngine,
  MigrationPlanner,
  MigrationExecutor,
  BehavioralExtractor,
  BehavioralApplier,
  TransactionManager,
  MigrationTable,
  RollbackGenerator,
  InMemoryStorageProvider,
  MigrationError,
  ExecutionError,
  IntrospectionError,
  DiffError,
  DDLGenerationError,
  PreCheckFailedError,
  PostCheckFailedError,
  MigrationConflictError,
  VersionIncompatibilityError,
  RollbackError,
  DriftDetectedError,
  LockAcquisitionError,
  TimeoutError,
  ValidationError,
  StorageError,
  PlanBlockedError,
  RecoveryError,
};

import { RISK_LEVELS, RISK_LEVEL_ORDER, mapExecutorStatusToDb } from './constants.js';

/**
 * @typedef {Object} EngineConfig
 * @property {string} [engineVersion='1.0.0']
 * @property {string} [lockTimeout='5s']
 * @property {string} [statementTimeout='30s']
 * @property {boolean} [dryRun=false]
 * @property {boolean} [snapshotBefore=true]
 * @property {boolean} [verifyAfter=true]
 * @property {string} [connectionId] - Database connection ID for multi-DB support
 * @property {'none'|'low'|'medium'|'high'|'critical'} [allowRiskBelow] - Only allow migrations below this risk level
 */

export class SwMigrationEngine {
  /**
   * @param {EngineConfig} config
   */
  constructor(config = {}) {
    this.config = {
      engineVersion: '1.0.0',
      lockTimeout: '5s',
      statementTimeout: '30s',
      dryRun: false,
      snapshotBefore: true,
      verifyAfter: true,
      connectionId: config.connectionId || null,
      allowRiskBelow: 'critical',
      ...config,
    };

    if (!this.config.connectionId) {
      console.warn(
        '[SwMigrationEngine] No connectionId provided. ' +
        'Migration records will not be scoped to a database. ' +
        'This may cause issues in multi-database environments.'
      );
    }

    this.pool = null;
    this.introspector = null;
    this.differ = new SchemaDiffer();
    this.planner = new MigrationPlanner();
    this.riskEngine = new RiskEngine();
    this.ddlGenerator = new DdlGenerator();
    this.behavioralExtractor = new BehavioralExtractor();
    this.behavioralApplier = new BehavioralApplier();
    this.rollbackGenerator = new RollbackGenerator();
  }

  /**
   * Set the database pool
   * @param {import('pg').Pool} pool
   */
  setPool(pool) {
    this.pool = pool;
    this.introspector = new SchemaIntrospector(pool);
  }

  /**
   * STEP 1: Introspect a live database
   * @param {import('pg').Pool} [pool]
   * @param {Object} [options]
   * @returns {Promise<import('./types/schema.js').SchemaSnapshot>}
   */
  async introspect(pool, options = {}) {
    const usePool = pool || this.pool;
    if (!usePool) {
      throw new IntrospectionError('Database pool is required. Call setPool() or pass pool to introspect().');
    }

    this.introspector = new SchemaIntrospector(usePool);
    return this.introspector.introspect(options);
  }

  /**
   * STEP 2: Diff two schema snapshots
   * @param {import('./types/schema.js').SchemaSnapshot} desired - Target schema
   * @param {import('./types/schema.js').SchemaSnapshot} current - Current schema
   * @returns {import('./types/changes.js').SchemaDiff}
   */
  diff(desired, current) {
    return this.differ.diff(desired, current);
  }

  /**
   * STEP 3: Generate DDL from a diff
   * @param {import('./types/changes.js').SchemaDiff} diff
   * @param {Object} [options]
   * @returns {string}
   */
  generateDDL(diff, options = {}) {
    const changes = Array.isArray(diff) ? diff : (diff.changes || []);
    return this.ddlGenerator.generate(changes, options);
  }

  /**
   * STEP 4: Create a migration plan from a diff
   * @param {import('./types/changes.js').SchemaDiff} diff
   * @param {Object} [options]
   * @returns {import('./types/migration.js').MigrationPlan}
   */
  plan(diff, options = {}) {
    const plan = this.planner.createPlan(diff, {
      ...options,
      pgVersion: options.pgVersion,
    });

    const riskAssessment = this.riskEngine.assess(plan.changes || [], options.pgVersion);
    plan.riskAssessment = riskAssessment;

    const riskOrder = ['none', 'low', 'medium', 'high', 'critical'];
    const maxAllowedIdx = riskOrder.indexOf(this.config.allowRiskBelow);
    const hasCritical = (plan.summary?.riskSummary?.critical || 0) > 0;
    const hasHigh = (plan.summary?.riskSummary?.high || 0) > 0;

    if (hasCritical && maxAllowedIdx <= riskOrder.indexOf('critical')) {
      plan.blocked = true;
      plan.blockReason = `Migration blocked: ${plan.summary.riskSummary.critical} critical risk(s) detected.`;
    } else if (hasHigh && maxAllowedIdx < riskOrder.indexOf('high')) {
      plan.blocked = true;
      plan.blockReason = `Migration blocked: ${plan.summary.riskSummary.high} high risk(s) detected.`;
    }

    return plan;
  }

  /**
   * STEP 5: Execute a migration plan
   * @param {import('pg').Pool} [pool]
   * @param {import('./types/migration.js').MigrationPlan} plan
   * @param {import('./types/execution.js').ExecutionOptions} [options]
   * @returns {Promise<import('./types/migration.js').MigrationResult>}
   */
  async execute(pool, plan, options = {}) {
    const usePool = pool || this.pool;
    if (!usePool) {
      throw new ExecutionError('Database pool is required. Call setPool() or pass pool to execute().');
    }

    if (plan.blocked && !options.allowBlocked) {
      throw new PlanBlockedError(plan.blockReason || 'Migration is blocked', { plan });
    }

    const connectionId = options.connectionId || this.config.connectionId || null;
    if (!connectionId) {
      console.warn(
        '[SwMigrationEngine] No connectionId for execute(). ' +
        'Migration records will not be scoped to a database.'
      );
    }

    const storage = new MigrationTable(usePool, connectionId);
    await storage.ensureTable();

    const introspector = new SchemaIntrospector(usePool);
    const executor = new MigrationExecutor(usePool, introspector, storage, {
      ...this.config,
      ...options,
      connectionId,
    });

    if (options.onProgress) {
      executor.onProgress(options.onProgress);
    }

    return executor.execute(plan, options);
  }

  /**
   * Dry-run a migration — validates SQL without applying changes
   * @param {import('pg').Pool} [pool]
   * @param {import('./types/migration.js').MigrationPlan} plan
   * @param {Object} [options]
   * @returns {Promise<Object>}
   */
  async dryRun(pool, plan, options = {}) {
    return this.execute(pool, plan, { ...options, dryRun: true });
  }

  /**
   * ONE-SHOT: Introspect → Diff → Plan → Execute
   * Convenience method for the full pipeline
   * @param {import('pg').Pool} [pool]
   * @param {import('./types/schema.js').SchemaSnapshot} desired - Target schema
   * @param {Object} [options]
   * @returns {Promise<import('./types/migration.js').MigrationResult>}
   */
  async migrate(pool, desired, options = {}) {
    const usePool = pool || this.pool;
    if (!usePool) {
      throw new ExecutionError('Database pool is required. Call setPool() or pass pool to migrate().');
    }

    const connectionId = options.connectionId || this.config.connectionId || null;
    if (!connectionId) {
      console.warn(
        '[SwMigrationEngine] No connectionId for migrate(). ' +
        'Migration records will not be scoped to a database.'
      );
    }

    const current = await this.introspect(usePool, options);

    if (current.checksum === desired.checksum) {
      return {
        success: true,
        status: 'no_changes',
        migrationId: null,
        message: 'No schema changes detected.',
        diff: { summary: { totalChanges: 0 }, changes: [] },
        executedSteps: [],
      };
    }

    const diff = this.diff(desired, current);

    if (diff.summary.totalChanges === 0) {
      return {
        success: true,
        status: 'no_changes',
        migrationId: null,
        message: 'No schema changes detected.',
        diff,
        executedSteps: [],
      };
    }

    const plan = this.plan(diff, options);

    if (plan.blocked) {
      return {
        success: false,
        status: 'blocked',
        migrationId: null,
        message: plan.blockReason,
        plan,
        diff,
        executedSteps: [],
      };
    }

    const execOptions = { ...options, connectionId };

    if (options.dryRun) {
      const dryRunResult = await this.dryRun(usePool, plan, execOptions);
      return {
        ...dryRunResult,
        status: 'dry_run',
        plan,
        diff,
      };
    }

    const result = await this.execute(usePool, plan, execOptions);
    return {
      ...result,
      plan,
      diff,
    };
  }

  /**
   * Get migration history
   * @param {import('pg').Pool} [pool]
   * @param {Object} [options]
   * @returns {Promise<Array>}
   */
  async getHistory(pool, options = {}) {
    const usePool = pool || this.pool;
    if (!usePool) {
      throw new StorageError('Database pool is required.');
    }

    const connectionId = options.connectionId || this.config.connectionId || null;
    const storage = new MigrationTable(usePool, connectionId);
    await storage.ensureTable();
    return storage.getHistory(connectionId, options.limit || 50, options.offset || 0);
  }

  /**
   * Get last successful migration
   * @param {import('pg').Pool} [pool]
   * @param {Object} [options]
   * @returns {Promise<Object|null>}
   */
  async getLastMigration(pool, options = {}) {
    const usePool = pool || this.pool;
    if (!usePool) {
      throw new StorageError('Database pool is required.');
    }

    const connectionId = options.connectionId || this.config.connectionId || null;
    const storage = new MigrationTable(usePool, connectionId);
    await storage.ensureTable();
    return storage.getLastMigration(connectionId);
  }

  /**
   * Rollback a migration (best-effort)
   * @param {import('pg').Pool} [pool]
   * @param {string} migrationId
   * @param {Object} [options]
   * @returns {Promise<Object>}
   */
  async rollback(pool, migrationId, options = {}) {
    const usePool = pool || this.pool;
    if (!usePool) {
      throw new StorageError('Database pool is required.');
    }

    const connectionId = options.connectionId || this.config.connectionId || null;
    const storage = new MigrationTable(usePool, connectionId);
    await storage.ensureTable();

    const migration = await storage.getRollbackSQL(migrationId);
    if (!migration) {
      throw new RollbackError(`Migration ${migrationId} not found.`);
    }

    if (migration.status !== 'completed') {
      throw new RollbackError(`Cannot rollback migration with status "${migration.status}".`);
    }

    const rollbackSteps = this.rollbackGenerator.generateRollback(migration);

    if (rollbackSteps.length === 0) {
      return {
        success: false,
        migrationId,
        status: 'no_rollback_available',
        message: 'No rollback steps could be generated for this migration.',
      };
    }

    for (const step of rollbackSteps) {
      if (!step.isTransactional) {
        step.warning = 'This step runs outside a transaction and cannot be rolled back.';
      }
    }

    const transactional = rollbackSteps.filter(s => s.isTransactional);
    const nonTransactional = rollbackSteps.filter(s => !s.isTransactional);

    const results = [];

    if (transactional.length > 0) {
      const tm = new TransactionManager(usePool);
      const txResults = await tm.executeTransactional(
        transactional.map(s => ({ id: s.originalChangeId, sql: s.sql })),
        {
          lockTimeout: this.config.lockTimeout,
          statementTimeout: this.config.statementTimeout,
        }
      );
      results.push(...txResults);
    }

    for (const step of nonTransactional) {
      const tm = new TransactionManager(usePool);
      const result = await tm.executeNonTransactional(
        { id: step.originalChangeId, sql: step.sql },
        { statementTimeout: this.config.statementTimeout }
      );
      results.push(result);
    }

    await storage.markRolledBack(migrationId);

    return {
      success: results.every(r => r.success),
      migrationId,
      status: 'rolled_back',
      steps: results,
      warning: 'Rollback is best-effort. Some changes (DROP TABLE, DROP COLUMN, enum value removal) cannot be reversed.',
    };
  }

  /**
   * Validate a desired schema against PG version constraints
   * @param {import('./types/schema.js').SchemaSnapshot} desired
   * @param {number} pgVersion
   * @returns {Object}
   */
  validate(desired, pgVersion) {
    return this.riskEngine.validateVersionCompatibility(desired, pgVersion);
  }

  /**
   * Assess risk for changes (alias for riskEngine.assess)
   * @param {Array} changes
   * @param {number} [pgVersion]
   * @returns {Object}
   */
  assessRisk(changes, pgVersion) {
    return this.riskEngine.assess(changes, pgVersion);
  }

  /**
   * Create a migration plan from changes
   * @param {Array} changes
   * @param {Object} options
   * @returns {import('./types/migration.js').MigrationPlan}
   */
  createMigrationPlan(changes, options) {
    const diff = { changes, summary: { totalChanges: changes.length } };
    return this.plan(diff, options);
  }

  /**
   * Diff two schemas (alias for diff)
   * @param {Object} desired
   * @param {Object} current
   * @returns {import('./types/changes.js').SchemaDiff}
   */
  diffSchemas(desired, current) {
    return this.diff(desired, current);
  }
}
