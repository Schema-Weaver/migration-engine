/**
 * Schema Weaver Migration Engine - Shared Constants
 *
 * This file defines the canonical values used across ALL layers.
 * No layer should define its own status values or risk levels.
 */

export const MIGRATION_STATUS = Object.freeze({
  COMPLETED: 'COMPLETED',
  PARTIALLY_APPLIED: 'PARTIALLY_APPLIED',
  FAILED: 'FAILED',
  DRY_RUN_SUCCESS: 'DRY_RUN_SUCCESS',
  DRY_RUN_FAILURE: 'DRY_RUN_FAILURE',
  RUNNING: 'RUNNING',
  PENDING: 'pending',
  NO_CHANGES: 'no_changes',
  BLOCKED: 'blocked',
});

export const DB_STATUS = Object.freeze({
  COMPLETED: 'completed',
  PARTIALLY_APPLIED: 'partially_applied',
  FAILED: 'failed',
  DRY_RUN_SUCCESS: 'dry_run_success',
  DRY_RUN_FAILURE: 'dry_run_failure',
  RUNNING: 'running',
  PENDING: 'pending',
  ROLLED_BACK: 'rolled_back',
});

export const RISK_LEVELS = Object.freeze({
  NONE: 'none',
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
});

export const RISK_LEVEL_ORDER = ['none', 'low', 'medium', 'high', 'critical'];

export const EXECUTION_STATUS = Object.freeze({
  IDLE: 'idle',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
});

export const DROP_PHASES = Object.freeze({
  behavioral: 27,
  constraints: 28,
  indexes: 29,
  columns: 30,
  sequences: 31,
  structural: 32,
});

export function isValidRiskLevel(level) {
  return RISK_LEVEL_ORDER.includes(level);
}

export function normalizeRiskLevel(level) {
  if (!level) return 'none';
  const lower = level.toLowerCase();
  return isValidRiskLevel(lower) ? lower : 'high';
}

export function compareRiskLevels(a, b) {
  const idxA = RISK_LEVEL_ORDER.indexOf(a);
  const idxB = RISK_LEVEL_ORDER.indexOf(b);
  return idxA - idxB;
}

export function maxRiskLevel(levels) {
  if (!levels || levels.length === 0) return 'none';
  return levels.reduce((max, level) => {
    return compareRiskLevels(level, max) > 0 ? level : max;
  }, 'none');
}

export function mapExecutorStatusToDb(executorStatus) {
  const mapping = {
    'COMPLETED': 'completed',
    'PARTIALLY_APPLIED': 'partially_applied',
    'FAILED': 'failed',
    'DRY_RUN_SUCCESS': 'dry_run_success',
    'DRY_RUN_FAILURE': 'dry_run_failure',
    'RUNNING': 'running',
    'PENDING': 'pending',
    'completed': 'completed',
    'partially_applied': 'partially_applied',
    'failed': 'failed',
    'running': 'running',
    'pending': 'pending',
    'rolled_back': 'rolled_back',
  };
  return mapping[executorStatus] || 'failed';
}
