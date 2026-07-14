/**
 * Custom error types for the Schema Weaver Migration Engine.
 * All errors extend the base MigrationError class.
 */

export class MigrationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'MigrationError';
    this.details = details;
    this.timestamp = new Date().toISOString();
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      details: this.details,
      timestamp: this.timestamp,
      stack: this.stack,
    };
  }
}

export class IntrospectionError extends MigrationError {
  constructor(message, details) {
    super(message, details);
    this.name = 'IntrospectionError';
  }
}

export class DiffError extends MigrationError {
  constructor(message, details) {
    super(message, details);
    this.name = 'DiffError';
  }
}

export class DDLGenerationError extends MigrationError {
  constructor(message, details) {
    super(message, details);
    this.name = 'DDLGenerationError';
  }
}

export class ExecutionError extends MigrationError {
  constructor(message, details) {
    super(message, details);
    this.name = 'ExecutionError';
    this.stepId = details?.step?.id;
    this.phase = details?.phase?.name;
    this.sql = details?.step?.sql;
    this.cause = details?.cause;
  }
}

export class PreCheckFailedError extends ExecutionError {
  constructor(message, details) {
    super(message, details);
    this.name = 'PreCheckFailedError';
  }
}

export class PostCheckFailedError extends ExecutionError {
  constructor(message, details) {
    super(message, details);
    this.name = 'PostCheckFailedError';
  }
}

export class MigrationConflictError extends MigrationError {
  constructor(message, details) {
    super(message, details);
    this.name = 'MigrationConflictError';
  }
}

export class VersionIncompatibilityError extends MigrationError {
  constructor(message, details) {
    super(message, details);
    this.name = 'VersionIncompatibilityError';
    this.requiredVersion = details?.requiredVersion;
    this.currentVersion = details?.currentVersion;
  }
}

export class RollbackError extends MigrationError {
  constructor(message, details) {
    super(message, details);
    this.name = 'RollbackError';
  }
}

export class DriftDetectedError extends MigrationError {
  constructor(message, details) {
    super(message, details);
    this.name = 'DriftDetectedError';
    this.driftDetails = details?.drift;
  }
}

export class LockAcquisitionError extends MigrationError {
  constructor(message, details) {
    super(message, details);
    this.name = 'LockAcquisitionError';
  }
}

export class TimeoutError extends MigrationError {
  constructor(message, details) {
    super(message, details);
    this.name = 'TimeoutError';
    this.timeout = details?.timeout;
  }
}

export class ValidationError extends MigrationError {
  constructor(message, details) {
    super(message, details);
    this.name = 'ValidationError';
    this.validationErrors = details?.errors || [];
  }
}

export class StorageError extends MigrationError {
  constructor(message, details) {
    super(message, details);
    this.name = 'StorageError';
  }
}

export class PlanBlockedError extends MigrationError {
  constructor(message, details) {
    super(message, details);
    this.name = 'PlanBlockedError';
    this.blockReason = details?.blockReason;
    this.riskAssessment = details?.riskAssessment;
  }
}

export class RecoveryError extends MigrationError {
  constructor(message, details) {
    super(message, details);
    this.name = 'RecoveryError';
    this.recoverySteps = details?.recoverySteps || [];
  }
}
