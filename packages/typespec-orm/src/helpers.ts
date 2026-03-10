/**
 * Helper / accessor functions for reading decorator state.
 * Emitters import these to introspect models without touching state keys directly.
 */

import type {
  Enum,
  EnumMember,
  Model,
  ModelProperty,
  Program,
  Scalar,
  Type,
} from "@typespec/compiler";
import {
  getDoc as tsGetDoc,
  getFormat as tsGetFormat,
  getMaxLength as tsGetMaxLength,
  getMaxValue as tsGetMaxValue,
  getMinLength as tsGetMinLength,
  getMinValue as tsGetMinValue,
  getPattern as tsGetPattern,
} from "@typespec/compiler";
import {
  TableKey,
  IdKey,
  MapKey,
  IndexKey,
  UniqueKey,
  AutoIncrementKey,
  SoftDeleteKey,
  ForeignKeyKey,
  RelationKey,
  CompositeIndexKey,
  CompositeUniqueKey,
  AutoCreateTimeKey,
  AutoUpdateTimeKey,
  PrecisionKey,
  OnDeleteKey,
  OnUpdateKey,
  IgnoreKey,
} from "./lib.js";

// ─── Table helpers ───────────────────────────────────────────────────────────

export function isTable(program: Program, model: Model): boolean {
  return program.stateMap(TableKey).has(model);
}

export function getTableName(program: Program, model: Model): string {
  const stored = program.stateMap(TableKey).get(model) as string | undefined;
  if (stored) return stored;
  return deriveTableName(model.name);
}

// ─── Property helpers ────────────────────────────────────────────────────────

export function isId(program: Program, prop: ModelProperty): boolean {
  return program.stateMap(IdKey).has(prop);
}

export function getColumnName(program: Program, prop: ModelProperty): string {
  const mapped = program.stateMap(MapKey).get(prop) as string | undefined;
  if (mapped) return mapped;
  return camelToSnake(prop.name);
}

export function isIndex(program: Program, prop: ModelProperty): boolean {
  return program.stateMap(IndexKey).has(prop);
}

export function getIndexName(program: Program, prop: ModelProperty): string {
  return (program.stateMap(IndexKey).get(prop) as string) ?? "";
}

export function isUnique(program: Program, prop: ModelProperty): boolean {
  return program.stateMap(UniqueKey).has(prop);
}

export function getDefaultValue(program: Program, prop: ModelProperty): string | undefined {
  // 1. TypeSpec builtin default (e.g. `credits: int32 = 0`) - preferred
  const builtin = prop.defaultValue;
  if (builtin) {
    switch (builtin.valueKind) {
      case "StringValue":
        return builtin.value;
      case "NumericValue":
        return builtin.value.toString();
      case "BooleanValue":
        return String(builtin.value);
      case "EnumValue":
        return builtin.value.value !== undefined ? String(builtin.value.value) : builtin.value.name;
      default:
        break;
    }
  }

  return undefined;
}

export function isAutoIncrement(program: Program, prop: ModelProperty): boolean {
  return program.stateMap(AutoIncrementKey).has(prop);
}

export function isSoftDelete(program: Program, prop: ModelProperty): boolean {
  return program.stateMap(SoftDeleteKey).has(prop);
}

export function getMaxLength(program: Program, prop: ModelProperty): number | undefined {
  return tsGetMaxLength(program, prop);
}

export function getMinLength(program: Program, prop: ModelProperty): number | undefined {
  return tsGetMinLength(program, prop);
}

export function getMinValue(program: Program, prop: ModelProperty): number | undefined {
  return tsGetMinValue(program, prop);
}

export function getMaxValue(program: Program, prop: ModelProperty): number | undefined {
  return tsGetMaxValue(program, prop);
}

export function getPattern(program: Program, prop: ModelProperty): string | undefined {
  return tsGetPattern(program, prop);
}

/**
 * Returns the TypeSpec @format value, e.g. "email", "uri", "date-time".
 * Used to emit format-specific validators in target languages.
 */
export function getFormat(program: Program, prop: ModelProperty): string | undefined {
  return tsGetFormat(program, prop);
}

export interface ForeignKeyInfo {
  table: string;
  column: string;
}

export function getForeignKey(program: Program, prop: ModelProperty): ForeignKeyInfo | undefined {
  return program.stateMap(ForeignKeyKey).get(prop) as ForeignKeyInfo | undefined;
}

export interface RelationInfo {
  type: string;
  foreignKey: string;
}

export function getRelation(program: Program, prop: ModelProperty): RelationInfo | undefined {
  return program.stateMap(RelationKey).get(prop) as RelationInfo | undefined;
}

// ─── Composite index / unique helpers ────────────────────────────────────────

export interface CompositeConstraint {
  name: string;
  columns: string[];
}

export function getCompositeIndexes(program: Program, model: Model): CompositeConstraint[] {
  return (
    (program.stateMap(CompositeIndexKey).get(model) as CompositeConstraint[] | undefined) ?? []
  );
}

export function getCompositeUniques(program: Program, model: Model): CompositeConstraint[] {
  return (
    (program.stateMap(CompositeUniqueKey).get(model) as CompositeConstraint[] | undefined) ?? []
  );
}

// ─── Timestamp auto-fill helpers ─────────────────────────────────────────────

export function isAutoCreateTime(program: Program, prop: ModelProperty): boolean {
  return program.stateMap(AutoCreateTimeKey).has(prop);
}

export function isAutoUpdateTime(program: Program, prop: ModelProperty): boolean {
  return program.stateMap(AutoUpdateTimeKey).has(prop);
}

// ─── Precision helper ────────────────────────────────────────────────────────

export interface PrecisionInfo {
  precision: number;
  scale: number;
}

export function getPrecision(program: Program, prop: ModelProperty): PrecisionInfo | undefined {
  return program.stateMap(PrecisionKey).get(prop) as PrecisionInfo | undefined;
}

// ─── Cascading constraint helpers ────────────────────────────────────────────

export function getOnDelete(program: Program, prop: ModelProperty): string | undefined {
  return program.stateMap(OnDeleteKey).get(prop) as string | undefined;
}

export function getOnUpdate(program: Program, prop: ModelProperty): string | undefined {
  return program.stateMap(OnUpdateKey).get(prop) as string | undefined;
}

// ─── Ignore field helper ─────────────────────────────────────────────────────

export function isIgnored(program: Program, prop: ModelProperty): boolean {
  return program.stateMap(IgnoreKey).has(prop);
}

// ─── Doc helper ──────────────────────────────────────────────────────────────

/**
 * Returns the @doc() string for a model or property, if set.
 */
export function getDoc(program: Program, target: Model | ModelProperty): string | undefined {
  const raw = tsGetDoc(program, target);
  if (!raw) return undefined;
  // Collapse multi-line @doc / /** */ values to a single line
  return raw.replace(/\r?\n[\t \*]*/g, " ").trim();
}

// ─── Enum helpers ────────────────────────────────────────────────────────────

export interface EnumMemberInfo {
  /** Member name as written in TypeSpec (e.g. "Active") */
  name: string;
  /** String value - uses explicit value or falls back to member name */
  value: string;
}

/**
 * Check if a property type is a TypeSpec Enum.
 */
export function isEnum(type: Type): type is Enum {
  return type.kind === "Enum";
}

/**
 * Given an Enum type, return its members as { name, value } pairs.
 */
export function getEnumMembers(enumType: Enum): EnumMemberInfo[] {
  const members: EnumMemberInfo[] = [];
  for (const [, member] of enumType.members) {
    const m = member as EnumMember;
    members.push({
      name: m.name,
      value: m.value !== undefined ? String(m.value) : m.name,
    });
  }
  return members;
}

/**
 * If the property type is an enum, return the enum info (type + members).
 * Returns undefined for non-enum types.
 */
export function getPropertyEnum(
  prop: ModelProperty,
): { enumType: Enum; members: EnumMemberInfo[] } | undefined {
  if (!isEnum(prop.type)) return undefined;
  return {
    enumType: prop.type,
    members: getEnumMembers(prop.type),
  };
}

// ─── Scalar resolution ───────────────────────────────────────────────────────

/**
 * Walk the scalar inheritance chain and return an ordered list of scalar names.
 * e.g. for `uuid extends string` → ["uuid", "string"]
 */
export function getScalarChain(scalar: Scalar): string[] {
  const chain: string[] = [];
  let current: Scalar | undefined = scalar;
  while (current) {
    chain.push(current.name);
    current = current.baseScalar;
  }
  return chain;
}

/**
 * Resolve a TypeSpec type to a canonical database type name.
 * Returns undefined for non-scalar types.
 */
export function resolveDbType(type: Type): string | undefined {
  if (type.kind !== "Scalar") return undefined;
  const chain = getScalarChain(type as Scalar);

  // Check custom scalars (defined in @qninhdt/typespec-orm)
  const CUSTOM_SCALARS = ["uuid", "text", "jsonb", "serial", "bigserial"];
  for (const name of chain) {
    if (CUSTOM_SCALARS.includes(name)) return name;
  }

  // Check standard TypeSpec scalars
  const STANDARD_MAP: Record<string, string> = {
    string: "string",
    boolean: "boolean",
    int8: "int8",
    int16: "int16",
    int32: "int32",
    int64: "int64",
    uint8: "uint8",
    uint16: "uint16",
    uint32: "uint32",
    uint64: "uint64",
    safeint: "int64",
    integer: "int64",
    float32: "float32",
    float64: "float64",
    numeric: "float64",
    float: "float64",
    decimal: "decimal",
    utcDateTime: "utcDateTime",
    offsetDateTime: "utcDateTime",
    plainDate: "date",
    plainTime: "time",
    duration: "duration",
    bytes: "bytes",
    url: "string",
  };

  for (const name of chain) {
    if (name in STANDARD_MAP) return STANDARD_MAP[name];
  }

  return undefined;
}

// ─── Naming utilities ────────────────────────────────────────────────────────

/** Convert camelCase to snake_case */
export function camelToSnake(name: string): string {
  return name
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase();
}

/** Convert camelCase to PascalCase with Go abbreviation rules */
export function camelToPascal(name: string): string {
  let result = name.charAt(0).toUpperCase() + name.slice(1);

  // Go common abbreviations
  const ABBREVIATIONS: Record<string, string> = {
    Id: "ID",
    Ids: "IDs",
    Url: "URL",
    Urls: "URLs",
    Uri: "URI",
    Uris: "URIs",
    Http: "HTTP",
    Https: "HTTPS",
    Api: "API",
    Uuid: "UUID",
    Sql: "SQL",
    Ip: "IP",
    Tcp: "TCP",
    Udp: "UDP",
    Ssh: "SSH",
    Cpu: "CPU",
    Json: "JSON",
  };

  for (const [from, to] of Object.entries(ABBREVIATIONS)) {
    // Replace at end of string
    const endPattern = new RegExp(`${from}$`);
    result = result.replace(endPattern, to);
    // Replace before uppercase letter (word boundary in PascalCase)
    const midPattern = new RegExp(`${from}(?=[A-Z])`, "g");
    result = result.replace(midPattern, to);
  }

  return result;
}

/** Derive table name from model name: PascalCase → snake_case plural */
export function deriveTableName(modelName: string): string {
  const snake = camelToSnake(modelName);
  if (snake.endsWith("s")) return snake;
  if (snake.endsWith("y")) return snake.slice(0, -1) + "ies";
  return snake + "s";
}

// ─── Auto-relation detection ─────────────────────────────────────────────────

export interface ResolvedRelation {
  /** Detected or explicit relation kind */
  kind: "many-to-one" | "one-to-many" | "one-to-one" | "many-to-many";
  /** The referenced Model type */
  targetModel: Model;
  /** Table name of the target model */
  targetTable: string;
  /** FK column name (snake_case) */
  fkColumnName: string;
  /** Column referenced in target table (default: "id") */
  fkTargetColumn: string;
  /** DB type of the FK (resolved from target PK type, e.g. "uuid") */
  fkDbType: string | undefined;
  /** Whether the emitter should auto-inject an FK scalar field on this model */
  autoInjectFk: boolean;
  /** Whether the FK column should get a standalone index (false if covered by composite or @unique) */
  autoInjectIndex: boolean;
  /** ON DELETE action */
  onDelete?: string;
  /** ON UPDATE action */
  onUpdate?: string;
  /** For one-to-many: PascalCase FK field name on target (for GORM foreignKey tag) */
  inverseFkFieldName?: string;
  /** For one-to-many/many-to-one: snake_case inverse relation name (for SQLModel back_populates) */
  backPopulates?: string;
}

/**
 * Find the primary key property of a model.
 */
export function findPrimaryKey(program: Program, model: Model): ModelProperty | undefined {
  for (const [, prop] of model.properties) {
    if (isId(program, prop)) return prop;
  }
  return undefined;
}

/**
 * Unwrap an array type (Model[]) and return the inner element Model.
 * TypeSpec arrays are Models with an indexer whose value is the element type.
 * Returns undefined if not an array of Models.
 */
export function unwrapArrayType(type: Type): Model | undefined {
  if (type.kind !== "Model") return undefined;
  if (!type.indexer) return undefined;
  const elementType = type.indexer.value;
  if (elementType.kind === "Model") return elementType as Model;
  return undefined;
}

/**
 * Resolve a relation from a model property by auto-detecting the type.
 *
 * - Singular Model ref (`owner: User`) → many-to-one (auto-injects FK)
 * - Array Model ref (`items: Item[]`) → one-to-many (FK on target side)
 * - Explicit `@relation("one-to-one")` override supported
 * - `@foreignKey` on the relation field overrides target column
 *
 * Returns undefined if the property is not a relation.
 */
export function resolveRelation(
  program: Program,
  prop: ModelProperty,
  parentModel: Model,
): ResolvedRelation | undefined {
  const onDelete = getOnDelete(program, prop);
  const onUpdate = getOnUpdate(program, prop);
  const explicitFk = getForeignKey(program, prop);
  const explicitRel = getRelation(program, prop);

  // Case 1: Singular @table Model reference → many-to-one (or one-to-one override)
  if (prop.type.kind === "Model" && isTable(program, prop.type as Model)) {
    const targetModel = prop.type as Model;
    const targetTable = getTableName(program, targetModel);
    const fkColumnName = camelToSnake(prop.name) + "_id";
    const fkTargetColumn = explicitFk?.column ?? "id";

    // Resolve FK type from target's primary key
    const targetPk = findPrimaryKey(program, targetModel);
    const fkDbType = targetPk ? resolveDbType(targetPk.type) : "uuid";

    // Don't auto-inject if parent already has a manual FK field
    const fkFieldName = prop.name + "Id";
    const hasManualFk = parentModel.properties.has(fkFieldName);

    const kind = explicitRel?.type === "one-to-one" ? "one-to-one" : "many-to-one";

    // Find inverse one-to-many on target for back_populates
    const forwardRef = findForwardReference(parentModel, targetModel);

    const coveredByLeadingComposite = [
      ...getCompositeIndexes(program, parentModel),
      ...getCompositeUniques(program, parentModel),
    ].some((c) => c.columns.length > 0 && c.columns[0] === fkColumnName);

    return {
      kind,
      targetModel,
      targetTable,
      fkColumnName,
      fkTargetColumn,
      fkDbType,
      autoInjectFk: !hasManualFk,
      autoInjectIndex: !coveredByLeadingComposite,
      onDelete,
      onUpdate,
      backPopulates: forwardRef,
    };
  }

  // Case 2: Array Model reference → one-to-many
  const arrayElement = unwrapArrayType(prop.type);
  if (arrayElement && isTable(program, arrayElement)) {
    const targetModel = arrayElement;
    const targetTable = getTableName(program, targetModel);

    // Find the inverse many-to-one on the target that points back
    const backRef = findBackReference(program, parentModel, targetModel);
    const fkColumnName = backRef?.fkColumnName ?? camelToSnake(parentModel.name) + "_id";
    const inverseFkFieldName = backRef
      ? camelToPascal(backRef.fieldName + "Id")
      : camelToPascal(parentModel.name.charAt(0).toLowerCase() + parentModel.name.slice(1) + "Id");
    const backPopulates = backRef
      ? camelToSnake(backRef.fieldName)
      : camelToSnake(parentModel.name);

    // Propagate cascade from the inverse many-to-one field so the
    // navigation field on the "has-many" side can carry the constraint.
    const inverseOnDelete = backRef ? getOnDelete(program, backRef.prop) : undefined;
    const inverseOnUpdate = backRef ? getOnUpdate(program, backRef.prop) : undefined;

    return {
      kind: "one-to-many",
      targetModel,
      targetTable,
      fkColumnName,
      fkTargetColumn: "id",
      fkDbType: undefined,
      autoInjectFk: false,
      autoInjectIndex: false,
      onDelete: inverseOnDelete ?? onDelete,
      onUpdate: inverseOnUpdate ?? onUpdate,
      inverseFkFieldName,
      backPopulates,
    };
  }

  return undefined;
}

/**
 * Find the back-reference field on targetModel that points to parentModel.
 * Used to resolve the FK column name for one-to-many relations.
 */
function findBackReference(
  program: Program,
  parentModel: Model,
  targetModel: Model,
): { fieldName: string; fkColumnName: string; prop: ModelProperty } | undefined {
  for (const [, prop] of targetModel.properties) {
    if (prop.type === parentModel) {
      return {
        fieldName: prop.name,
        fkColumnName: camelToSnake(prop.name) + "_id",
        prop,
      };
    }
  }
  // Secondary: uuid scalar field with @foreignKey referencing parentModel's table
  const parentTable = getTableName(program, parentModel);
  for (const [, prop] of targetModel.properties) {
    const fkInfo = getForeignKey(program, prop);
    if (fkInfo?.table === parentTable) {
      const columnName = getColumnName(program, prop);
      const fieldNameBase = prop.name.endsWith("Id") ? prop.name.slice(0, -2) : prop.name;
      return {
        fieldName: fieldNameBase,
        fkColumnName: columnName,
        prop,
      };
    }
  }
  return undefined;
}

/**
 * Find the forward-reference (one-to-many) on targetModel that collects parentModel.
 * Used for SQLModel back_populates on the many-to-one side.
 */
function findForwardReference(parentModel: Model, targetModel: Model): string | undefined {
  for (const [, prop] of targetModel.properties) {
    const arrElement = unwrapArrayType(prop.type);
    if (arrElement === parentModel) {
      return camelToSnake(prop.name);
    }
  }
  return undefined;
}

// ─── Collector ───────────────────────────────────────────────────────────────

export interface TableModel {
  model: Model;
  tableName: string;
}

/** Collect all models decorated with @table from the program state. */
export function collectTableModels(program: Program): TableModel[] {
  const tables: TableModel[] = [];
  for (const [type, name] of program.stateMap(TableKey)) {
    if (type.kind === "Model") {
      const model = type as Model;
      const tableName = (name as string) || deriveTableName(model.name);
      tables.push({ model, tableName });
    }
  }
  tables.sort((a, b) => a.tableName.localeCompare(b.tableName));
  return tables;
}
