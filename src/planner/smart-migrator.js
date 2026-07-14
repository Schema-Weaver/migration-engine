import { TypeRegistry } from './type-registry.js';

const PHASES = {
  ADD_COLUMN: 7,
  DATA_MIGRATION: 11,
  DROP_COLUMN: 30,
};

export class SmartMigrator {
  constructor() {
    this.typeRegistry = new TypeRegistry();
  }

  /**
   * @param {import('../types/changes.js').SchemaChange} change
   * @returns {import('../types/migration.js').MigrationStep[] | null}
   */
  analyze(change) {
    const isAlterColumn = change.changeType === 'ALTER' && 
                          change.objectType === 'column' && 
                          change.changedProperties?.includes('dataType');
    
    if (!isAlterColumn) return null;

    const fromType = change.before?.dataType;
    const toType = change.after?.dataType;
    if (!fromType || !toType) return null;

    if (this.typeRegistry.isImpossibleCast(fromType, toType)) {
      return this.createMultiStepPlan(change, fromType, toType);
    }

    return null;
  }

  /**
   * @param {import('../types/changes.js').SchemaChange} change
   * @param {string} fromType
   * @param {string} toType
   * @returns {import('../types/migration.js').MigrationStep[]}
   */
  createMultiStepPlan(change, fromType, toType) {
    const table = change.objectKey.split('.').slice(0, -1).join('.');
    const col = change.after?.name || change.name;
    const tempCol = `${col}_new`;
    const stepBase = `smart_${Date.now()}`;

    return [
      {
        id: `${stepBase}_1`,
        type: 'structural',
        phase: PHASES.ADD_COLUMN,
        description: `Add new column ${tempCol} with type ${toType}`,
        sql: `ALTER TABLE ${table} ADD COLUMN ${tempCol} ${toType};`,
        isTransactional: true,
        riskLevel: 'low',
        dependencies: [],
      },
      {
        id: `${stepBase}_2`,
        type: 'data_migration',
        phase: PHASES.DATA_MIGRATION,
        description: `Backfill data from ${col} to ${tempCol}`,
        sql: `-- Batched backfill: UPDATE ${table} SET ${tempCol} = ${col}::${toType} WHERE ${tempCol} IS NULL;`,
        isTransactional: true,
        riskLevel: 'medium',
        dependencies: [`${stepBase}_1`],
        estimatedRows: 10000,
      },
      {
        id: `${stepBase}_3`,
        type: 'structural',
        phase: PHASES.DROP_COLUMN,
        description: `Drop old column and rename new column`,
        sql: `ALTER TABLE ${table} DROP COLUMN ${col}; ALTER TABLE ${table} RENAME COLUMN ${tempCol} TO ${col};`,
        isTransactional: true,
        riskLevel: 'high',
        dependencies: [`${stepBase}_2`],
      },
    ];
  }
}
