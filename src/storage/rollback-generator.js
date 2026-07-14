/**
 * Rollback Generator - Generate rollback SQL for migrations
 */

export class RollbackGenerator {
  /**
   * Generate rollback SQL from a completed migration's history
   * @param {Object} migration - Migration history record
   * @returns {Array} Rollback SQL statements in reverse order
   */
  generateRollback(migration) {
    const diff = migration.schema_diff || migration.diff;
    const rollbackSteps = [];

    if (!diff?.changes) {
      return rollbackSteps;
    }

    const changes = [...diff.changes].reverse();

    for (const change of changes) {
      const undoSQL = this.generateUndoForChange(change);
      if (undoSQL) {
        rollbackSteps.push({
          sql: undoSQL,
          originalChangeId: change.id,
          changeType: change.changeType,
          objectKey: change.objectKey || change.path,
          isTransactional: change.isTransactional !== false,
        });
      }
    }

    return rollbackSteps;
  }

  /**
   * Generate undo SQL for a single change
   * @param {Object} change
   * @returns {string|null}
   */
  generateUndoForChange(change) {
    const changeType = change.changeType;
    const objectType = change.objectType;
    const path = change.objectKey || change.path;
    const schema = change.schema;
    const name = change.name;

    switch (changeType) {
      case 'CREATE':
      case 'ADD':
        return this.generateUndoForCreate(change, objectType, path);

      case 'DROP':
      case 'REMOVE':
        return this.generateUndoForDrop(change, objectType, path);

      case 'ALTER':
        return this.generateUndoForAlter(change, objectType, path);

      case 'RENAME':
        return this.generateUndoForRename(change, path);

      case 'RECREATE':
      case 'REPLACE':
        return this.generateUndoForReplace(change, objectType, path);

      default:
        if (changeType?.startsWith('CREATE')) {
          return this.generateUndoForCreate(change, objectType, path);
        }
        if (changeType?.startsWith('DROP')) {
          return this.generateUndoForDrop(change, objectType, path);
        }
        return `-- CANNOT AUTO-ROLLBACK: Unknown change type "${changeType}" for ${path}`;
    }
  }

  /**
   * Generate undo for CREATE operations
   */
  generateUndoForCreate(change, objectType, path) {
    switch (objectType) {
      case 'table':
        return `DROP TABLE IF EXISTS ${path} CASCADE;`;

      case 'index':
        if (change.isConcurrent) {
          return `DROP INDEX CONCURRENTLY IF EXISTS ${path};`;
        }
        return `DROP INDEX IF EXISTS ${path};`;

      case 'constraint':
        const conTable = change.after?.tableKey || change.schema;
        const conName = change.after?.name || change.name;
        return `ALTER TABLE ${conTable} DROP CONSTRAINT IF EXISTS ${conName};`;

      case 'view':
        return `DROP VIEW IF EXISTS ${path} CASCADE;`;

      case 'materializedView':
        return `DROP MATERIALIZED VIEW IF EXISTS ${path} CASCADE;`;

      case 'function':
      case 'procedure':
        const fnArgs = change.after?.argumentTypes 
          ? `(${change.after.argumentTypes.join(', ')})`
          : '';
        return `DROP ${objectType === 'procedure' ? 'PROCEDURE' : 'FUNCTION'} IF EXISTS ${path}${fnArgs} CASCADE;`;

      case 'trigger':
        const trigTable = change.after?.tableName || change.after?.table;
        const trigName = change.after?.name || change.name;
        return `DROP TRIGGER IF EXISTS ${trigName} ON ${trigTable};`;

      case 'policy':
        const polTable = change.after?.table;
        const polName = change.after?.name || change.name;
        return `DROP POLICY IF EXISTS ${polName} ON ${polTable};`;

      case 'type':
        return `DROP TYPE IF EXISTS ${path} CASCADE;`;

      case 'sequence':
        return `DROP SEQUENCE IF EXISTS ${path} CASCADE;`;

      case 'schema':
        return `DROP SCHEMA IF EXISTS ${change.after?.name || change.name} CASCADE;`;

      case 'extension':
        return `DROP EXTENSION IF EXISTS ${change.after?.name || change.name} CASCADE;`;

      case 'rule':
        const ruleTable = change.after?.tableName || change.after?.table;
        const ruleName = change.after?.name || change.name;
        return `DROP RULE IF EXISTS ${ruleName} ON ${ruleTable};`;

      default:
        return `-- CANNOT AUTO-ROLLBACK: CREATE for object type "${objectType}" on ${path}`;
    }
  }

  /**
   * Generate undo for DROP operations
   */
  generateUndoForDrop(change, objectType, path) {
    switch (objectType) {
      case 'table':
        return `-- CANNOT ROLLBACK: Table ${path} was dropped. Data cannot be recovered.`;

      case 'column':
        return `-- CANNOT FULLY ROLLBACK: Column ${path} was dropped. Data cannot be recovered.`;

      case 'constraint':
        return `-- CANNOT ROLLBACK: Constraint ${path} was dropped. Recreate manually with original definition.`;

      case 'index':
        return `-- CANNOT ROLLBACK: Index ${path} was dropped. Recreate manually with original definition.`;

      case 'view':
      case 'materializedView':
        return `-- CANNOT ROLLBACK: ${objectType} ${path} was dropped. Recreate manually.`;

      case 'function':
      case 'procedure':
        return `-- CANNOT ROLLBACK: ${objectType} ${path} was dropped. Recreate manually.`;

      case 'trigger':
      case 'policy':
      case 'rule':
        return `-- CANNOT ROLLBACK: ${objectType} ${path} was dropped. Recreate manually.`;

      default:
        return `-- CANNOT AUTO-ROLLBACK: DROP for object type "${objectType}" on ${path}`;
    }
  }

  /**
   * Generate undo for ALTER operations
   */
  generateUndoForAlter(change, objectType, path) {
    const property = change.property;
    const currentValue = change.currentValue;
    const desiredValue = change.desiredValue;
    const parts = path.split('.');
    const col = parts.pop();
    const table = parts.join('.');

    switch (property) {
      case 'dataType':
      case 'type':
        return `ALTER TABLE ${table} ALTER COLUMN "${col}" TYPE ${currentValue};`;

      case 'isNullable':
      case 'notNull':
        if (desiredValue === true || desiredValue === false && currentValue === true) {
          return `ALTER TABLE ${table} ALTER COLUMN "${col}" DROP NOT NULL;`;
        }
        return `ALTER TABLE ${table} ALTER COLUMN "${col}" SET NOT NULL;`;

      case 'defaultValue':
      case 'default':
        if (desiredValue === null) {
          return `ALTER TABLE ${table} ALTER COLUMN "${col}" SET DEFAULT ${currentValue};`;
        }
        if (currentValue === null) {
          return `ALTER TABLE ${table} ALTER COLUMN "${col}" DROP DEFAULT;`;
        }
        return `ALTER TABLE ${table} ALTER COLUMN "${col}" SET DEFAULT ${currentValue};`;

      case 'comment':
        if (currentValue) {
          return `COMMENT ON COLUMN ${path} IS '${currentValue.replace(/'/g, "''")}';`;
        }
        return `COMMENT ON COLUMN ${path} IS NULL;`;

      default:
        return `-- CANNOT AUTO-ROLLBACK: Property "${property}" change on ${path}`;
    }
  }

  /**
   * Generate undo for RENAME operations
   */
  generateUndoForRename(change, path) {
    const oldName = change.oldName || change.before?.name;
    const newName = change.newName || change.after?.name;
    const objectType = change.objectType;
    const schema = change.schema;

    switch (objectType) {
      case 'table':
        return `ALTER TABLE ${schema}.${newName} RENAME TO ${oldName};`;

      case 'column':
        const tableName = change.tableName || change.after?.tableName;
        return `ALTER TABLE ${schema}.${tableName} RENAME COLUMN ${newName} TO ${oldName};`;

      case 'index':
        return `ALTER INDEX ${schema}.${newName} RENAME TO ${oldName};`;

      case 'constraint':
        const conTable = change.tableName || change.after?.tableName;
        return `ALTER TABLE ${schema}.${conTable} RENAME CONSTRAINT ${newName} TO ${oldName};`;

      default:
        return `-- CANNOT AUTO-ROLLBACK: RENAME for object type "${objectType}" on ${path}`;
    }
  }

  /**
   * Generate undo for REPLACE/RECREATE operations
   */
  generateUndoForReplace(change, objectType, path) {
    const currentValue = change.currentValue || change.before;
    const before = change.before;

    switch (objectType) {
      case 'view':
        if (currentValue?.definition || before?.definition) {
          return `CREATE OR REPLACE VIEW ${path} AS ${currentValue?.definition || before.definition};`;
        }
        return `-- CANNOT ROLLBACK: View ${path} was replaced. Original definition not available.`;

      case 'materializedView':
        return `-- CANNOT FULLY ROLLBACK: Materialized view ${path} was recreated. Data would need to be refreshed.`;

      case 'function':
      case 'procedure':
        if (currentValue?.source || before?.source) {
          return `CREATE OR REPLACE ${objectType === 'procedure' ? 'PROCEDURE' : 'FUNCTION'} ${path} AS $$${currentValue?.source || before.source}$$;`;
        }
        return `-- CANNOT ROLLBACK: ${objectType} ${path} was replaced. Original source not available.`;

      case 'trigger':
        const trigTable = change.tableName || before?.tableName;
        const trigName = change.name || before?.name;
        return `DROP TRIGGER IF EXISTS ${trigName} ON ${trigTable};`;

      case 'policy':
        return `-- CANNOT FULLY ROLLBACK: Policy ${path} was recreated. May need manual restoration.`;

      default:
        return `-- CANNOT AUTO-ROLLBACK: REPLACE for object type "${objectType}" on ${path}`;
    }
  }

  /**
   * Check if rollback is possible for a change
   * @param {Object} change
   * @returns {{possible: boolean, reason: string}}
   */
  canRollback(change) {
    const changeType = change.changeType;
    const objectType = change.objectType;

    if (changeType?.startsWith('DROP')) {
      if (objectType === 'table' || objectType === 'column') {
        return { possible: false, reason: 'Data loss - cannot recover dropped data' };
      }
      return { possible: false, reason: 'Definition lost - need original DDL to recreate' };
    }

    if (changeType === 'ADD_ENUM_VALUES') {
      return { possible: false, reason: 'PostgreSQL cannot remove enum values without recreating type' };
    }

    return { possible: true, reason: 'Rollback available' };
  }

  /**
   * Generate full rollback script with comments
   * @param {Object} migration
   * @returns {string}
   */
  generateRollbackScript(migration) {
    const steps = this.generateRollback(migration);
    const lines = [];

    lines.push(`-- Rollback script for migration: ${migration.migration_id || migration.id}`);
    lines.push(`-- Generated at: ${new Date().toISOString()}`);
    lines.push(`-- WARNING: This is a best-effort rollback. Some changes cannot be reversed.`);
    lines.push('');
    lines.push('BEGIN;');
    lines.push('');

    for (const step of steps) {
      if (step.sql.startsWith('--')) {
        lines.push(`-- Step ${step.originalChangeId}: (cannot rollback)`);
        lines.push(`-- ${step.sql.replace(/^-- /, '')}`);
      } else {
        lines.push(`-- Rollback step ${step.originalChangeId}: ${step.changeType} ${step.objectKey}`);
        lines.push(step.sql);
      }
      lines.push('');
    }

    lines.push('COMMIT;');
    lines.push('');
    lines.push('-- End of rollback script');

    return lines.join('\n');
  }
}
