# @schema-weaver/migration-engine

[![npm version](https://img.shields.io/npm/v/@schema-weaver/migration-engine.svg)](https://www.npmjs.com/package/@schema-weaver/migration-engine)
[![license](https://img.shields.io/badge/license-BSL--1.1-red.svg)](https://github.com/Schema-Weaver/migration-engine/blob/main/LICENSE)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-10%20%E2%80%93%2018-blue.svg)](https://www.postgresql.org/)

> [!WARNING]
> **Commercial Use License Required**
> 
> This package is licensed under the **Business Source License 1.1 (BSL)**. It is free for local development, testing, and evaluation purposes, but **requires a separate paid commercial license for production use**.
> 
> For commercial licensing: **vivek@vivekmind.com**

**PostgreSQL schema introspection, diff, DDL generation, and safe migration execution.**

---

## Why This Exists

No existing open-source tool covers 37 PostgreSQL object types comprehensively:

| Tool | Coverage | Limitations |
|------|----------|-------------|
| pgAdmin | UI only | No programmatic API, no diff |
| Atlas | ~15 types | Missing views, functions, triggers, policies |
| Prisma | ~10 types | Ignores behavioral objects entirely |
| Django Migrations | ~12 types | ORM-specific, limited DDL control |

**This engine covers EVERYTHING** — 37 object types with 98.5% property coverage.

---

## Supported Object Types (37)

### Track 1: Structural Objects

| Type | Properties | Coverage |
|------|------------|----------|
| Table | 31 | 100% |
| Column | 28/30 | 93% |
| Index | 26 | 100% |
| Constraint | 20 | 100% |
| Sequence | 14 | 100% |
| Enum Type | 9 | 100% |
| Composite Type | 10 | 100% |
| Domain Type | 16 | 100% |
| Range Type | 10 | 100% |
| Schema | 5 | 100% |
| Extension | — | ✅ |
| Statistics | 9 | 100% |
| Partition | 6 | 100% |
| Collation | 10/11 | 91% |
| Cast | — | ✅ |
| Operator / OpClass / OpFamily | — | ✅ |
| Access Method | — | ✅ |
| Foreign Table | — | ✅ |
| Default Privileges | — | ✅ |

### Track 2: Behavioral Objects

View, Materialized View, Function, Procedure, Aggregate, Trigger, Event Trigger, Policy, Rule, Cast, Text Search (Config/Dict/Parser/Template), Conversion, FDW, Foreign Server, User Mapping, Publication, Subscription

**Overall: 194/197 properties = 98.5% coverage across PG10–PG18**

---

## Architecture (7 Layers)

```
SQL ──► Introspector ──► Translator ──► Differ ──► DDL Generator ──► Planner ──► Executor
                                │                      │                         │
                                ▼                      ▼                         ▼
                           Risk Tagger          Safe Patterns              Storage
                                                                          (history)
```

| Layer | Purpose |
|-------|---------|
| **1. Introspector** | Queries `pg_catalog` for all 37 object types |
| **2. Translator** | Normalizes raw PG rows into canonical schema model |
| **3. Differ** | Detects CREATE/ALTER/DROP/RENAME with property-level diff |
| **4. DDL Generator** | Generates safe DDL with 3-step patterns |
| **5. Planner** | Dependency-ordered, phase-based plan (Track 1 → Track 2) |
| **6. Executor** | Advisory locks, savepoints, drift detection, progress |
| **7. Storage** | Migration history (PG / Memory / File backends) |

---

## Installation

```bash
npm install @schema-weaver/migration-engine pg
```

---

## Quick Start

```javascript
import pg from 'pg';
import { SwMigrationEngine } from '@schema-weaver/migration-engine';

const pool = new pg.Pool({ 
  host: 'localhost', 
  port: 5432,
  database: 'mydb',
  user: 'postgres',
  password: 'pass'
});

const engine = new SwMigrationEngine();

// Introspect current database
const snapshot = await engine.introspect(pool);

// Diff against desired schema
const desired = /* your target schema */;
const diff = engine.diff(desired, snapshot);

// Generate DDL
const ddl = engine.generateDDL(diff);

// Plan migration respecting dependencies
const plan = engine.plan(diff);

// Execute with safety checks
if (!plan.blocked) {
  const result = await engine.execute(pool, plan);
  console.log('Migrated:', result.migrationId);
}

// Or one-shot migrate
const result = await engine.migrate(pool, desired);
```

---

## Key Features

### 37 PostgreSQL Object Types
Most comprehensive coverage available. See [Supported Objects](https://github.com/Schema-Weaver/migration-engine/wiki/Supported-Objects).

### PG 10–18 Support
Version-gated queries automatically adapt to your PostgreSQL version.

### Safe Migration Patterns

| Pattern | How It Works |
|---------|--------------|
| **NOT NULL** | 3-step: DEFAULT → NOT NULL → DROP DEFAULT |
| **FK Constraint** | NOT VALID → validate separately |
| **Index** | CONCURRENTLY for zero-downtime |
| **Enum ADD VALUE** | Pre-transaction for PG < 14 |

### 5-Level Risk Assessment

| Level | Examples | Default |
|-------|----------|---------|
| `none` | CREATE TABLE, ADD nullable column | ✅ Allow |
| `low` | ADD COLUMN with default, CREATE INDEX | ✅ Allow |
| `medium` | ALTER COLUMN type (widening) | ✅ Allow |
| `high` | DROP INDEX, ALTER type (narrowing) | ❌ Block |
| `critical` | DROP TABLE, DROP COLUMN | ❌ Block |

### RENAME Detection
Smart matching detects renames instead of DROP+CREATE, preserving data.

### Drift Detection
Fingerprint-based schema drift alerts when database changed outside migrations.

### Rollback Generation
Automatic reverse DDL for supported changes.

### Non-Transactional Aware
Handles `ALTER ENUM ADD VALUE`, `CREATE INDEX CONCURRENTLY`, `REINDEX CONCURRENTLY`.

---

## API Reference

| Method | Description |
|--------|-------------|
| `introspect(pool)` | Capture database schema as `SchemaSnapshot` |
| `diff(desired, current)` | Detect changes between schemas |
| `generateDDL(diff)` | Generate PostgreSQL DDL statements |
| `plan(diff)` | Create dependency-ordered migration plan |
| `execute(pool, plan)` | Apply migration transactionally |
| `migrate(pool, desired)` | One-shot: introspect → diff → plan → execute |
| `rollback(pool, migrationId)` | Revert migration (best-effort) |

Full API: [API Reference](https://github.com/Schema-Weaver/migration-engine/wiki/API-Reference)

---

## Ecosystem

| Package | Purpose |
|---------|---------|
| **[sw-agent](https://www.npmjs.com/package/@vivekmind/sw-agent)** | PostgreSQL connection pool, security, audit |
| **[pg-ddl-parser](https://www.npmjs.com/package/pg-ddl-parser)** | DDL parsing (CREATE/ALTER/DROP → schema) |
| **@schema-weaver/migration-engine** | Schema introspection, diff, migration |

```javascript
import { parsePostgresSQL } from 'pg-ddl-parser';
import { SwMigrationEngine } from '@schema-weaver/migration-engine';

// Parse DDL → desired schema
const desired = parsePostgresSQL(fs.readFileSync('schema.sql', 'utf8'));

// Migrate
const engine = new SwMigrationEngine();
await engine.migrate(pool, convertParsedToSnapshot(desired));
```

---

## Test Results

| Layer | Test | Assertions | Result |
|-------|------|------------|--------|
| 1 | Introspection Accuracy | 93 | ✅ 100% PASS |
| 2 | Diff Detection | — | ✅ PASS |
| 3 | E2E Pipeline | 12 | ✅ 100% PASS |
| 4 | Planner Order | — | ✅ Phase order verified |
| 5 | Execution | — | Partial — needs production |
| 6 | Recovery | — | Pending |

Tested against **PostgreSQL 18.1** with a 25-table, 4-schema, 1052-object database.

---

## Documentation

- [Architecture](https://github.com/Schema-Weaver/migration-engine/wiki/Architecture) — 7-layer deep dive
- [Supported Objects](https://github.com/Schema-Weaver/migration-engine/wiki/Supported-Objects) — Full 37-type coverage
- [Safe Patterns](https://github.com/Schema-Weaver/migration-engine/wiki/Safe-Migration-Patterns) — 3-step workflows
- [Risk Assessment](https://github.com/Schema-Weaver/migration-engine/wiki/Risk-Assessment) — 5 levels explained
- [PG Version Matrix](https://github.com/Schema-Weaver/migration-engine/wiki/PG-Version-Matrix) — Feature support PG10-18

---

## PostgreSQL Version Support

| Version | Status | Key Features |
|---------|--------|--------------|
| PG 10 | ✅ | Generated columns |
| PG 11 | ✅ | Procedures, INCLUDE indexes |
| PG 12 | ✅ | GENERATED ALWAYS |
| PG 13 | ✅ | Incremental sort |
| PG 14 | ✅ | Multirange, security invoker |
| PG 15 | ✅ | NULLS NOT DISTINCT |
| PG 16 | ✅ | ANY_VALUE |
| PG 17 | ✅ | MERGE improvements |
| PG 18 | ✅ | Temporal tables, PERIOD |

---

## License

Business Source License 1.1 (BSL) — see [LICENSE](./LICENSE)

- ✅ Free for development, testing, evaluation
- ✅ Free for non-production environments
- ❌ Production use requires commercial license

Contact: **vivek@vivekmind.com**

---

Built by [Schema Weaver](https://schemaweaver.vivekmind.com) — the visual PostgreSQL IDE.
