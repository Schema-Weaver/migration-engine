/**
 * SchemaSnapshot - Complete representation of a PostgreSQL database schema
 * @typedef {Object} SchemaSnapshot
 * @property {{numeric:number,major:number,string:string}} version
 * @property {string} timestamp
 * @property {string} checksum
 * @property {DatabaseInfo} [database]
 * @property {Record<string, SchemaInfo>} schemas
 * @property {Record<string, TableInfo>} tables
 * @property {Record<string, ViewInfo>} views
 * @property {Record<string, MaterializedViewInfo>} materializedViews
 * @property {Record<string, IndexInfo>} indexes
 * @property {Record<string, FunctionInfo>} functions
 * @property {Record<string, ProcedureInfo>} procedures
 * @property {Record<string, AggregateInfo>} aggregates
 * @property {Record<string, TriggerInfo>} triggers
 * @property {Record<string, EventTriggerInfo>} eventTriggers
 * @property {Record<string, TypeInfo>} types
 * @property {Record<string, SequenceInfo>} sequences
 * @property {Record<string, ExtensionInfo>} extensions
 * @property {Record<string, PolicyInfo>} policies
 * @property {Record<string, ConstraintInfo>} constraints
 * @property {Record<string, string>} comments
 * @property {GrantInfo[]} grants
 * @property {Record<string, StatisticsInfo>} statistics
 * @property {Record<string, CollationInfo>} collations
 * @property {Record<string, ConversionInfo>} conversions
 * @property {Record<string, OperatorInfo>} operators
 * @property {Record<string, OperatorClassInfo>} operatorClasses
 * @property {Record<string, OperatorFamilyInfo>} operatorFamilies
 * @property {Record<string, TextSearchConfigInfo>} textSearchConfigs
 * @property {Record<string, TextSearchDictInfo>} textSearchDictionaries
 * @property {Record<string, TextSearchParserInfo>} textSearchParsers
 * @property {Record<string, TextSearchTemplateInfo>} textSearchTemplates
 * @property {Record<string, ForeignDataWrapperInfo>} foreignDataWrappers
 * @property {Record<string, ForeignServerInfo>} foreignServers
 * @property {Record<string, UserMappingInfo>} userMappings
 * @property {Record<string, CastInfo>} casts
 * @property {Record<string, RuleInfo>} rules
 * @property {Record<string, RoleInfo>} roles
 * @property {Record<string, TablespaceInfo>} tablespaces
 * @property {Record<string, AccessMethodInfo>} accessMethods
 * @property {Record<string, LanguageInfo>} languages
 * @property {Record<string, DefaultPrivilegeInfo>} defaultPrivileges
 * @property {Record<string, DatabaseInfo>} databases
 * @property {Record<string, PublicationInfo>} publications
 * @property {Record<string, SubscriptionInfo>} subscriptions
 */
export type SchemaSnapshot = {
    version: {
        numeric: number;
        major: number;
        string: string;
    };
    timestamp: string;
    checksum: string;
    database?: DatabaseInfo;
    schemas: Record<string, SchemaInfo>;
    tables: Record<string, TableInfo>;
    views: Record<string, ViewInfo>;
    materializedViews: Record<string, MaterializedViewInfo>;
    indexes: Record<string, IndexInfo>;
    functions: Record<string, FunctionInfo>;
    procedures: Record<string, ProcedureInfo>;
    aggregates: Record<string, AggregateInfo>;
    triggers: Record<string, TriggerInfo>;
    eventTriggers: Record<string, EventTriggerInfo>;
    types: Record<string, TypeInfo>;
    sequences: Record<string, SequenceInfo>;
    extensions: Record<string, ExtensionInfo>;
    policies: Record<string, PolicyInfo>;
    constraints: Record<string, ConstraintInfo>;
    comments: Record<string, string>;
    grants: GrantInfo[];
    statistics: Record<string, StatisticsInfo>;
    collations: Record<string, CollationInfo>;
    conversions: Record<string, ConversionInfo>;
    operators: Record<string, OperatorInfo>;
    operatorClasses: Record<string, OperatorClassInfo>;
    operatorFamilies: Record<string, OperatorFamilyInfo>;
    textSearchConfigs: Record<string, TextSearchConfigInfo>;
    textSearchDictionaries: Record<string, TextSearchDictInfo>;
    textSearchParsers: Record<string, TextSearchParserInfo>;
    textSearchTemplates: Record<string, TextSearchTemplateInfo>;
    foreignDataWrappers: Record<string, ForeignDataWrapperInfo>;
    foreignServers: Record<string, ForeignServerInfo>;
    userMappings: Record<string, UserMappingInfo>;
    casts: Record<string, CastInfo>;
    rules: Record<string, RuleInfo>;
    roles: Record<string, RoleInfo>;
    tablespaces: Record<string, TablespaceInfo>;
    accessMethods: Record<string, AccessMethodInfo>;
    languages: Record<string, LanguageInfo>;
    defaultPrivileges: Record<string, DefaultPrivilegeInfo>;
    databases: Record<string, DatabaseInfo>;
    publications: Record<string, PublicationInfo>;
    subscriptions: Record<string, SubscriptionInfo>;
};
export type SchemaInfo = {
    name: string;
    owner: string;
};
export type DatabaseInfo = {
    name: string;
    owner: string;
    encoding: string;
    collate: string;
    ctype: string;
    isTemplate?: boolean;
    allowConn?: boolean;
};
export type TableInfo = {
    schema: string;
    name: string;
    owner: string;
    isTemporary: boolean;
    isUnlogged: boolean;
    isPartitioned: boolean;
    isPartition: boolean;
    isForeignTable: boolean;
    partitionStrategy?: 'RANGE' | 'LIST' | 'HASH';
    partitionColumns?: string[];
    partitionParent?: string;
    partitionBound?: string;
    partitionKeyDef?: string;
    inheritsFrom?: string[];
    ofType?: string;
    tablespace?: string;
    storageParameters?: Record<string, string | number>;
    replicaIdentity?: 'DEFAULT' | 'NOTHING' | 'FULL' | 'INDEX';
    hasOids?: boolean;
    comment?: string;
    privileges?: Object[];
    rlsEnabled: boolean;
    rlsForced: boolean;
    columns: ColumnInfo[];
    constraints: string[];
    indexes: string[];
    triggers: string[];
    policies: string[];
    foreignServer?: string;
    foreignOptions?: Object;
};
export type ColumnInfo = {
    name: string;
    dataType: string;
    ordinalPosition: number;
    isNullable: boolean;
    defaultValue?: string;
    isGenerated: boolean;
    generatedExpression?: string;
    generatedStorage?: 'STORED' | 'VIRTUAL';
    isIdentity: boolean;
    identityMode?: 'ALWAYS' | 'BY_DEFAULT';
    identityOptions?: SequenceOptions;
    collation?: string;
    storage?: 'PLAIN' | 'EXTERNAL' | 'EXTENDED' | 'MAIN' | 'DEFAULT';
    statistics?: number;
    compression?: string;
    comment?: string;
    foreignOptions?: Object;
};
export type ConstraintInfo = {
    schema: string;
    name: string;
    table: string;
    type: 'PRIMARY_KEY' | 'UNIQUE' | 'FOREIGN_KEY' | 'CHECK' | 'EXCLUSION' | 'NOT_NULL';
    deferrable: boolean;
    initiallyDeferred: boolean;
    isValidated: boolean;
    enforced: boolean;
    noInherit: boolean;
    definition: string;
    columns?: string[];
    referencedTable?: string;
    referencedColumns?: string[];
    matchType?: 'FULL' | 'PARTIAL' | 'SIMPLE';
    onDelete?: string;
    onUpdate?: string;
    periodColumn?: string;
    withoutOverlaps?: string;
    nullsNotDistinct?: boolean;
    checkExpression?: string;
    excludeElements?: Array<{
        column: string;
        operator: string;
    }>;
    excludeMethod?: string;
    index?: string;
};
export type IndexInfo = {
    schema: string;
    name: string;
    table: string;
    isUnique: boolean;
    isPrimary: boolean;
    isConcurrent: boolean;
    method: string;
    columns: IndexColumnInfo[];
    includeColumns?: string[];
    whereClause?: string;
    storageParameters?: Record<string, string | number>;
    tablespace?: string;
    nullsNotDistinct?: boolean;
    isPartitioned?: boolean;
    comment?: string;
};
export type IndexColumnInfo = {
    expression: string;
    collation?: string;
    opclass?: string;
    direction?: 'ASC' | 'DESC';
    nullsOrder?: 'FIRST' | 'LAST';
};
export type FunctionInfo = {
    schema: string;
    name: string;
    argumentTypes: string[];
    returnType: string;
    language: string;
    source: string;
    volatility: 'IMMUTABLE' | 'STABLE' | 'VOLATILE';
    isStrict: boolean;
    security: 'INVOKER' | 'DEFINER';
    parallel: 'SAFE' | 'UNSAFE' | 'RESTRICTED';
    isLeakproof: boolean;
    cost: number;
    rows: number;
    kind: 'FUNCTION' | 'PROCEDURE' | 'AGGREGATE' | 'WINDOW';
    comment?: string;
};
export type ProcedureInfo = {
    schema: string;
    name: string;
    argumentTypes: string[];
    language: string;
    source: string;
    security: 'INVOKER' | 'DEFINER';
    parallel: 'SAFE' | 'UNSAFE' | 'RESTRICTED';
};
export type AggregateInfo = {
    schema: string;
    name: string;
    argumentTypes: string[];
    returnType: string;
    language: string;
    source: string;
};
export type ViewInfo = {
    schema: string;
    name: string;
    definition: string;
    owner: string;
    checkOption?: 'LOCAL' | 'CASCADED';
    isRecursive: boolean;
    columns?: ColumnInfo[];
    comment?: string;
};
export type MaterializedViewInfo = {
    schema: string;
    name: string;
    definition: string;
    owner: string;
    tablespace?: string;
    storageParameters?: Record<string, string | number>;
    withData: boolean;
    comment?: string;
};
export type TypeInfo = {
    schema: string;
    name: string;
    kind: 'ENUM' | 'COMPOSITE' | 'DOMAIN' | 'RANGE' | 'BASE' | 'SHELL' | 'MULTIRANGE';
    rangeType?: string;
    enumValues?: string[];
    attributes?: Array<{
        name: string;
        type: string;
    }>;
    baseType?: string;
    notNull?: boolean;
    defaultValue?: string;
    checkConstraint?: string;
    subtype?: string;
    inputFunction?: string;
    outputFunction?: string;
    owner: string;
    comment?: string;
};
export type SequenceInfo = {
    schema: string;
    name: string;
    dataType: string;
    startValue?: number;
    increment?: number;
    minValue?: number;
    maxValue?: number;
    cache?: number;
    cycle: boolean;
    ownedBy?: string;
    owner: string;
};
export type TriggerInfo = {
    schema: string;
    name: string;
    table: string;
    timing: 'BEFORE' | 'AFTER' | 'INSTEAD OF';
    events: Array<'INSERT' | 'UPDATE' | 'DELETE' | 'TRUNCATE'>;
    isForEachRow: boolean;
    whenCondition?: string;
    functionCall: string;
    enabled: 'ENABLED' | 'DISABLED' | 'REPLICA' | 'ALWAYS';
    comment?: string;
};
export type EventTriggerInfo = {
    name: string;
    event: string;
    function: string;
    enabled: 'ENABLED' | 'DISABLED' | 'REPLICA' | 'ALWAYS';
    tags: string[];
    owner: string;
};
export type ExtensionInfo = {
    name: string;
    schema: string;
    version: string;
    isAvailable: boolean;
};
export type PolicyInfo = {
    schema: string;
    name: string;
    table: string;
    command: 'ALL' | 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';
    isPermissive: boolean;
    roles: string[];
    usingExpression?: string;
    withCheckExpression?: string;
};
export type GrantInfo = {
    schema: string;
    object: string;
    objectType: string;
    privilege: string;
    grantee: string;
    grantor: string;
    isGrantable: boolean;
    column?: string;
};
export type SequenceOptions = {
    startWith?: number;
    incrementBy?: number;
    minValue?: number | 'NO_MINVALUE';
    maxValue?: number | 'NO_MAXVALUE';
    cache?: number;
    cycle?: boolean;
    ownedBy?: string;
};
export type StatisticsInfo = {
    schema: string;
    name: string;
    table?: string;
    kinds: Array<string>;
    columns: string[];
    definition?: string;
    owner: string;
};
export type CollationInfo = {
    schema: string;
    name: string;
    provider: string;
    locale?: string;
    encoding?: number;
    isDeterministic: boolean;
    owner: string;
};
export type ConversionInfo = {
    schema: string;
    name: string;
    proc: string;
    isDefault: boolean;
    owner: string;
};
export type OperatorInfo = {
    schema: string;
    name: string;
    leftType?: string;
    rightType?: string;
    resultType?: string;
    proc: string;
    canHash: boolean;
    canMerge: boolean;
    commutator?: string;
    negator?: string;
    owner: string;
};
export type OperatorClassInfo = {
    schema: string;
    name: string;
    family: string;
    inputType: string;
    isDefault: boolean;
    accessMethod: string;
    owner: string;
};
export type OperatorFamilyInfo = {
    schema: string;
    name: string;
    accessMethod: string;
    owner: string;
};
export type TextSearchConfigInfo = {
    schema: string;
    name: string;
    parser: string;
    owner: string;
};
export type TextSearchDictInfo = {
    schema: string;
    name: string;
    template: string;
    options?: Object;
    owner: string;
};
export type TextSearchParserInfo = {
    schema: string;
    name: string;
    start: string;
    getToken: string;
    end: string;
    headline?: string;
    owner: string;
};
export type TextSearchTemplateInfo = {
    schema: string;
    name: string;
    init?: string;
    lexize: string;
    owner: string;
};
export type ForeignDataWrapperInfo = {
    name: string;
    handler?: string;
    validator?: string;
    options?: Object;
    owner: string;
};
export type ForeignServerInfo = {
    name: string;
    fdw: string;
    type?: string;
    options?: Object;
    owner: string;
};
export type UserMappingInfo = {
    user: string;
    server: string;
    options?: Object;
};
export type CastInfo = {
    sourceType: string;
    targetType: string;
    function?: string;
    context: 'EXPLICIT' | 'ASSIGNMENT' | 'IMPLICIT';
    method: 'FUNCTION' | 'INOUT' | 'BINARY';
};
export type RuleInfo = {
    schema: string;
    name: string;
    table: string;
    event: string;
    isInstead: boolean;
    isEnabled: boolean;
    definition?: string;
    qual?: string;
};
export type RoleInfo = {
    name: string;
    isSuperuser: boolean;
    canCreateRole: boolean;
    canCreateDB: boolean;
    canLogin: boolean;
    inherit: boolean;
    memberships: Array<{
        member: string;
        admin_option: boolean;
    }>;
    comment?: string;
};
export type TablespaceInfo = {
    name: string;
    owner: string;
    location?: string;
    isDefault: boolean;
    acl?: string;
    options?: Object;
};
export type AccessMethodInfo = {
    name: string;
    type: 'TABLE' | 'INDEX';
    handler?: string;
};
export type LanguageInfo = {
    name: string;
    isTrusted: boolean;
    handler?: string;
    inline?: string;
    validator?: string;
    owner: string;
};
export type DefaultPrivilegeInfo = {
    role: string;
    schema?: string;
    objectType: string;
    acl: string;
};
export type PublicationInfo = {
    name: string;
    owner: string;
    allTables: boolean;
    insert: boolean;
    update: boolean;
    delete: boolean;
    truncate: boolean;
    tables: string[];
    schemas: string[];
};
export type SubscriptionInfo = {
    name: string;
    conninfo: string;
    slotName?: string;
    publications: string[];
    enabled: boolean;
    syncCommit?: boolean;
    owner: string;
};
/**
 * @typedef {Object} SchemaInfo
 * @property {string} name
 * @property {string} owner
 */
/**
 * @typedef {Object} DatabaseInfo
 * @property {string} name
 * @property {string} owner
 * @property {string} encoding
 * @property {string} collate
 * @property {string} ctype
 * @property {boolean} [isTemplate]
 * @property {boolean} [allowConn]
 */
/**
 * @typedef {Object} TableInfo
 * @property {string} schema
 * @property {string} name
 * @property {string} owner
 * @property {boolean} isTemporary
 * @property {boolean} isUnlogged
 * @property {boolean} isPartitioned
 * @property {boolean} isPartition
 * @property {boolean} isForeignTable
 * @property {'RANGE'|'LIST'|'HASH'} [partitionStrategy]
 * @property {string[]} [partitionColumns]
 * @property {string} [partitionParent]
 * @property {string} [partitionBound]
 * @property {string} [partitionKeyDef]
 * @property {string[]} [inheritsFrom]
 * @property {string} [ofType]
 * @property {string} [tablespace]
 * @property {Record<string, string|number>} [storageParameters]
 * @property {'DEFAULT'|'NOTHING'|'FULL'|'INDEX'} [replicaIdentity]
 * @property {boolean} [hasOids]
 * @property {string} [comment]
 * @property {Object[]} [privileges]
 * @property {boolean} rlsEnabled
 * @property {boolean} rlsForced
 * @property {ColumnInfo[]} columns
 * @property {string[]} constraints
 * @property {string[]} indexes
 * @property {string[]} triggers
 * @property {string[]} policies
 * @property {string} [foreignServer]
 * @property {Object} [foreignOptions]
 */
/**
 * @typedef {Object} ColumnInfo
 * @property {string} name
 * @property {string} dataType
 * @property {number} ordinalPosition
 * @property {boolean} isNullable
 * @property {string} [defaultValue]
 * @property {boolean} isGenerated
 * @property {string} [generatedExpression]
 * @property {'STORED'|'VIRTUAL'} [generatedStorage]
 * @property {boolean} isIdentity
 * @property {'ALWAYS'|'BY_DEFAULT'} [identityMode]
 * @property {SequenceOptions} [identityOptions]
 * @property {string} [collation]
 * @property {'PLAIN'|'EXTERNAL'|'EXTENDED'|'MAIN'|'DEFAULT'} [storage]
 * @property {number} [statistics]
 * @property {string} [compression]
 * @property {string} [comment]
 * @property {Object} [foreignOptions]
 */
/**
 * @typedef {Object} ConstraintInfo
 * @property {string} schema
 * @property {string} name
 * @property {string} table
 * @property {'PRIMARY_KEY'|'UNIQUE'|'FOREIGN_KEY'|'CHECK'|'EXCLUSION'|'NOT_NULL'} type
 * @property {boolean} deferrable
 * @property {boolean} initiallyDeferred
 * @property {boolean} isValidated
 * @property {boolean} enforced
 * @property {boolean} noInherit
 * @property {string} definition
 * @property {string[]} [columns]
 * @property {string} [referencedTable]
 * @property {string[]} [referencedColumns]
 * @property {'FULL'|'PARTIAL'|'SIMPLE'} [matchType]
 * @property {string} [onDelete]
 * @property {string} [onUpdate]
 * @property {string} [periodColumn]
 * @property {string} [withoutOverlaps]
 * @property {boolean} [nullsNotDistinct]
 * @property {string} [checkExpression]
 * @property {Array<{column:string,operator:string}>} [excludeElements]
 * @property {string} [excludeMethod]
 * @property {string} [index]
 */
/**
 * @typedef {Object} IndexInfo
 * @property {string} schema
 * @property {string} name
 * @property {string} table
 * @property {boolean} isUnique
 * @property {boolean} isPrimary
 * @property {boolean} isConcurrent
 * @property {string} method
 * @property {IndexColumnInfo[]} columns
 * @property {string[]} [includeColumns]
 * @property {string} [whereClause]
 * @property {Record<string, string|number>} [storageParameters]
 * @property {string} [tablespace]
 * @property {boolean} [nullsNotDistinct]
 * @property {boolean} [isPartitioned]
 * @property {string} [comment]
 */
/**
 * @typedef {Object} IndexColumnInfo
 * @property {string} expression
 * @property {string} [collation]
 * @property {string} [opclass]
 * @property {'ASC'|'DESC'} [direction]
 * @property {'FIRST'|'LAST'} [nullsOrder]
 */
/**
 * @typedef {Object} FunctionInfo
 * @property {string} schema
 * @property {string} name
 * @property {string[]} argumentTypes
 * @property {string} returnType
 * @property {string} language
 * @property {string} source
 * @property {'IMMUTABLE'|'STABLE'|'VOLATILE'} volatility
 * @property {boolean} isStrict
 * @property {'INVOKER'|'DEFINER'} security
 * @property {'SAFE'|'UNSAFE'|'RESTRICTED'} parallel
 * @property {boolean} isLeakproof
 * @property {number} cost
 * @property {number} rows
 * @property {'FUNCTION'|'PROCEDURE'|'AGGREGATE'|'WINDOW'} kind
 * @property {string} [comment]
 */
/**
 * @typedef {Object} ProcedureInfo
 * @property {string} schema
 * @property {string} name
 * @property {string[]} argumentTypes
 * @property {string} language
 * @property {string} source
 * @property {'INVOKER'|'DEFINER'} security
 * @property {'SAFE'|'UNSAFE'|'RESTRICTED'} parallel
 */
/**
 * @typedef {Object} AggregateInfo
 * @property {string} schema
 * @property {string} name
 * @property {string[]} argumentTypes
 * @property {string} returnType
 * @property {string} language
 * @property {string} source
 */
/**
 * @typedef {Object} ViewInfo
 * @property {string} schema
 * @property {string} name
 * @property {string} definition
 * @property {string} owner
 * @property {'LOCAL'|'CASCADED'} [checkOption]
 * @property {boolean} isRecursive
 * @property {ColumnInfo[]} [columns]
 * @property {string} [comment]
 */
/**
 * @typedef {Object} MaterializedViewInfo
 * @property {string} schema
 * @property {string} name
 * @property {string} definition
 * @property {string} owner
 * @property {string} [tablespace]
 * @property {Record<string, string|number>} [storageParameters]
 * @property {boolean} withData
 * @property {string} [comment]
 */
/**
 * @typedef {Object} TypeInfo
 * @property {string} schema
 * @property {string} name
 * @property {'ENUM'|'COMPOSITE'|'DOMAIN'|'RANGE'|'BASE'|'SHELL'|'MULTIRANGE'} kind
 * @property {string} [rangeType]
 * @property {string[]} [enumValues]
 * @property {Array<{name:string,type:string}>} [attributes]
 * @property {string} [baseType]
 * @property {boolean} [notNull]
 * @property {string} [defaultValue]
 * @property {string} [checkConstraint]
 * @property {string} [subtype]
 * @property {string} [inputFunction]
 * @property {string} [outputFunction]
 * @property {string} owner
 * @property {string} [comment]
 */
/**
 * @typedef {Object} SequenceInfo
 * @property {string} schema
 * @property {string} name
 * @property {string} dataType
 * @property {number} [startValue]
 * @property {number} [increment]
 * @property {number} [minValue]
 * @property {number} [maxValue]
 * @property {number} [cache]
 * @property {boolean} cycle
 * @property {string} [ownedBy]
 * @property {string} owner
 */
/**
 * @typedef {Object} TriggerInfo
 * @property {string} schema
 * @property {string} name
 * @property {string} table
 * @property {'BEFORE'|'AFTER'|'INSTEAD OF'} timing
 * @property {Array<'INSERT'|'UPDATE'|'DELETE'|'TRUNCATE'>} events
 * @property {boolean} isForEachRow
 * @property {string} [whenCondition]
 * @property {string} functionCall
 * @property {'ENABLED'|'DISABLED'|'REPLICA'|'ALWAYS'} enabled
 * @property {string} [comment]
 */
/**
 * @typedef {Object} EventTriggerInfo
 * @property {string} name
 * @property {string} event
 * @property {string} function
 * @property {'ENABLED'|'DISABLED'|'REPLICA'|'ALWAYS'} enabled
 * @property {string[]} tags
 * @property {string} owner
 */
/**
 * @typedef {Object} ExtensionInfo
 * @property {string} name
 * @property {string} schema
 * @property {string} version
 * @property {boolean} isAvailable
 */
/**
 * @typedef {Object} PolicyInfo
 * @property {string} schema
 * @property {string} name
 * @property {string} table
 * @property {'ALL'|'SELECT'|'INSERT'|'UPDATE'|'DELETE'} command
 * @property {boolean} isPermissive
 * @property {string[]} roles
 * @property {string} [usingExpression]
 * @property {string} [withCheckExpression]
 */
/**
 * @typedef {Object} GrantInfo
 * @property {string} schema
 * @property {string} object
 * @property {string} objectType
 * @property {string} privilege
 * @property {string} grantee
 * @property {string} grantor
 * @property {boolean} isGrantable
 * @property {string} [column]
 */
/**
 * @typedef {Object} SequenceOptions
 * @property {number} [startWith]
 * @property {number} [incrementBy]
 * @property {number|'NO_MINVALUE'} [minValue]
 * @property {number|'NO_MAXVALUE'} [maxValue]
 * @property {number} [cache]
 * @property {boolean} [cycle]
 * @property {string} [ownedBy]
 */
/**
 * @typedef {Object} StatisticsInfo
 * @property {string} schema
 * @property {string} name
 * @property {string} [table]
 * @property {Array<string>} kinds
 * @property {string[]} columns
 * @property {string} [definition]
 * @property {string} owner
 */
/**
 * @typedef {Object} CollationInfo
 * @property {string} schema
 * @property {string} name
 * @property {string} provider
 * @property {string} [locale]
 * @property {number} [encoding]
 * @property {boolean} isDeterministic
 * @property {string} owner
 */
/**
 * @typedef {Object} ConversionInfo
 * @property {string} schema
 * @property {string} name
 * @property {string} proc
 * @property {boolean} isDefault
 * @property {string} owner
 */
/**
 * @typedef {Object} OperatorInfo
 * @property {string} schema
 * @property {string} name
 * @property {string} [leftType]
 * @property {string} [rightType]
 * @property {string} [resultType]
 * @property {string} proc
 * @property {boolean} canHash
 * @property {boolean} canMerge
 * @property {string} [commutator]
 * @property {string} [negator]
 * @property {string} owner
 */
/**
 * @typedef {Object} OperatorClassInfo
 * @property {string} schema
 * @property {string} name
 * @property {string} family
 * @property {string} inputType
 * @property {boolean} isDefault
 * @property {string} accessMethod
 * @property {string} owner
 */
/**
 * @typedef {Object} OperatorFamilyInfo
 * @property {string} schema
 * @property {string} name
 * @property {string} accessMethod
 * @property {string} owner
 */
/**
 * @typedef {Object} TextSearchConfigInfo
 * @property {string} schema
 * @property {string} name
 * @property {string} parser
 * @property {string} owner
 */
/**
 * @typedef {Object} TextSearchDictInfo
 * @property {string} schema
 * @property {string} name
 * @property {string} template
 * @property {Object} [options]
 * @property {string} owner
 */
/**
 * @typedef {Object} TextSearchParserInfo
 * @property {string} schema
 * @property {string} name
 * @property {string} start
 * @property {string} getToken
 * @property {string} end
 * @property {string} [headline]
 * @property {string} owner
 */
/**
 * @typedef {Object} TextSearchTemplateInfo
 * @property {string} schema
 * @property {string} name
 * @property {string} [init]
 * @property {string} lexize
 * @property {string} owner
 */
/**
 * @typedef {Object} ForeignDataWrapperInfo
 * @property {string} name
 * @property {string} [handler]
 * @property {string} [validator]
 * @property {Object} [options]
 * @property {string} owner
 */
/**
 * @typedef {Object} ForeignServerInfo
 * @property {string} name
 * @property {string} fdw
 * @property {string} [type]
 * @property {Object} [options]
 * @property {string} owner
 */
/**
 * @typedef {Object} UserMappingInfo
 * @property {string} user
 * @property {string} server
 * @property {Object} [options]
 */
/**
 * @typedef {Object} CastInfo
 * @property {string} sourceType
 * @property {string} targetType
 * @property {string} [function]
 * @property {'EXPLICIT'|'ASSIGNMENT'|'IMPLICIT'} context
 * @property {'FUNCTION'|'INOUT'|'BINARY'} method
 */
/**
 * @typedef {Object} RuleInfo
 * @property {string} schema
 * @property {string} name
 * @property {string} table
 * @property {string} event
 * @property {boolean} isInstead
 * @property {boolean} isEnabled
 * @property {string} [definition]
 * @property {string} [qual]
 */
/**
 * @typedef {Object} RoleInfo
 * @property {string} name
 * @property {boolean} isSuperuser
 * @property {boolean} canCreateRole
 * @property {boolean} canCreateDB
 * @property {boolean} canLogin
 * @property {boolean} inherit
 * @property {Array<{member:string,admin_option:boolean}>} memberships
 * @property {string} [comment]
 */
/**
 * @typedef {Object} TablespaceInfo
 * @property {string} name
 * @property {string} owner
 * @property {string} [location]
 * @property {boolean} isDefault
 * @property {string} [acl]
 * @property {Object} [options]
 */
/**
 * @typedef {Object} AccessMethodInfo
 * @property {string} name
 * @property {'TABLE'|'INDEX'} type
 * @property {string} [handler]
 */
/**
 * @typedef {Object} LanguageInfo
 * @property {string} name
 * @property {boolean} isTrusted
 * @property {string} [handler]
 * @property {string} [inline]
 * @property {string} [validator]
 * @property {string} owner
 */
/**
 * @typedef {Object} DefaultPrivilegeInfo
 * @property {string} role
 * @property {string} [schema]
 * @property {string} objectType
 * @property {string} acl
 */
/**
 * @typedef {Object} PublicationInfo
 * @property {string} name
 * @property {string} owner
 * @property {boolean} allTables
 * @property {boolean} insert
 * @property {boolean} update
 * @property {boolean} delete
 * @property {boolean} truncate
 * @property {string[]} tables
 * @property {string[]} schemas
 */
/**
 * @typedef {Object} SubscriptionInfo
 * @property {string} name
 * @property {string} conninfo
 * @property {string} [slotName]
 * @property {string[]} publications
 * @property {boolean} enabled
 * @property {boolean} [syncCommit]
 * @property {string} owner
 */
export {};
