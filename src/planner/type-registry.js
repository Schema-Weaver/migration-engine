/**
 * Type cast compatibility matrix
 */
export class TypeRegistry {
  constructor() {
    this.implicitCasts = new Map([
      ['smallint', new Set(['integer', 'bigint', 'real', 'double precision', 'numeric', 'decimal'])],
      ['integer', new Set(['bigint', 'real', 'double precision', 'numeric', 'decimal'])],
      ['bigint', new Set(['real', 'double precision', 'numeric', 'decimal'])],
      ['real', new Set(['double precision', 'numeric'])],
      ['numeric', new Set(['numeric'])],
      ['character varying', new Set(['text', 'character varying'])],
      ['character', new Set(['text', 'character varying', 'character'])],
      ['text', new Set(['character varying'])],
      ['date', new Set(['timestamp', 'timestamptz'])],
      ['timestamp', new Set(['timestamptz'])],
    ]);

    this.impossibleCasts = new Set([
      'text->integer', 'text->bigint', 'text->numeric',
      'integer->boolean', 'boolean->integer',
      'text->date', 'text->timestamp', 'text->uuid',
      'jsonb->json', 'json->jsonb',
    ]);
  }

  canCastImplicitly(from, to) {
    return this.implicitCasts.get(from.toLowerCase())?.has(to.toLowerCase()) || false;
  }

  isImpossibleCast(from, to) {
    return this.impossibleCasts.has(`${from.toLowerCase()}->${to.toLowerCase()}`);
  }

  requiresUsingClause(from, to) {
    return !this.canCastImplicitly(from, to) && !this.isImpossibleCast(from, to);
  }

  generateUsingClause(from, to, column) {
    if (to.toLowerCase() === 'text' || to.toLowerCase().startsWith('character')) return `${column}::text`;
    if (to.toLowerCase() === 'integer') return `${column}::integer`;
    if (to.toLowerCase() === 'numeric') return `${column}::numeric`;
    if (to.toLowerCase() === 'uuid') return `${column}::uuid`;
    if (to.toLowerCase() === 'timestamptz') return `${column}::timestamptz`;
    return `${column}::${to}`;
  }
}
