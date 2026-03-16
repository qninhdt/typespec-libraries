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
  getMaxItems as tsGetMaxItems,
  getMaxValueExclusive as tsGetMaxValueExclusive,
  getMaxLength as tsGetMaxLength,
  getMaxValue as tsGetMaxValue,
  getMinItems as tsGetMinItems,
  getMinValueExclusive as tsGetMinValueExclusive,
  getMinLength as tsGetMinLength,
  getMinValue as tsGetMinValue,
  getPattern as tsGetPattern,
  isKey as tsIsKey,
} from "@typespec/compiler";
import {
  TableKey,
  MapKey,
  IndexKey,
  UniqueKey,
  AutoIncrementKey,
  SoftDeleteKey,
  ForeignKeyKey,
  MappedByKey,
  CompositeIndexKey,
  CompositeUniqueKey,
  AutoCreateTimeKey,
  AutoUpdateTimeKey,
  PrecisionKey,
  OnDeleteKey,
  OnUpdateKey,
  IgnoreKey,
  DataKey,
  TitleKey,
  PlaceholderKey,
  InputTypeKey,
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

// ─── Extended validation helpers (optional) ───────────────────────────────────

/**
 * Check if a property is the primary key using @key (TypeSpec built-in).
 */
export function isKey(program: Program, prop: ModelProperty): boolean {
  // Use TypeSpec's built-in isKey function
  return tsIsKey(program, prop);
}

export function isArrayType(type: Type): boolean {
  // In TypeSpec, arrays are Models with an indexer
  return type.kind === "Model" && (type as Model).indexer !== undefined;
}

export function getArrayElementType(type: Type): Type | undefined {
  // In TypeSpec, arrays are Models with an indexer
  if (type.kind === "Model") {
    const model = type as Model;
    if (model.indexer) {
      return model.indexer.value;
    }
  }
  return undefined;
}

export interface ValidatorInfo {
  name: string;
  args?: string;
}

/**
 * Collect all validators for a property.
 * Returns an array of ValidatorInfo objects with name and optional args.
 */
export function getValidators(program: Program, prop: ModelProperty): ValidatorInfo[] {
  const validators: ValidatorInfo[] = [];

  // Length validators
  const maxLen = getMaxLength(program, prop);
  if (maxLen !== undefined) validators.push({ name: "maxLength", args: String(maxLen) });

  const minLen = getMinLength(program, prop);
  if (minLen !== undefined) validators.push({ name: "minLength", args: String(minLen) });

  // Value validators
  const maxVal = getMaxValue(program, prop);
  if (maxVal !== undefined) validators.push({ name: "maxValue", args: String(maxVal) });

  const minVal = getMinValue(program, prop);
  if (minVal !== undefined) validators.push({ name: "minValue", args: String(minVal) });

  const maxValEx = getMaxValueExclusive(program, prop);
  if (maxValEx !== undefined)
    validators.push({ name: "maxValueExclusive", args: String(maxValEx) });

  const minValEx = getMinValueExclusive(program, prop);
  if (minValEx !== undefined)
    validators.push({ name: "minValueExclusive", args: String(minValEx) });

  // Array item validators
  const maxItems = getMaxItems(program, prop);
  if (maxItems !== undefined) validators.push({ name: "maxItems", args: String(maxItems) });

  const minItems = getMinItems(program, prop);
  if (minItems !== undefined) validators.push({ name: "minItems", args: String(minItems) });

  // Pattern
  const pattern = getPattern(program, prop);
  if (pattern) validators.push({ name: "pattern", args: pattern });

  // Format
  const format = getFormat(program, prop);
  if (format) validators.push({ name: "format", args: format });

  return validators;
}

// ─── Lookup type support ─────────────────────────────────────────────────────

/**
 * If a property's type is itself a ModelProperty (lookup type syntax, e.g.
 * `inviteeEmail: User.email`), return that source ModelProperty.
 * Emitters use this to inherit validators / decorators from the referenced
 * property when the type is a lookup reference.
 */
function lookupSourceProp(prop: ModelProperty): ModelProperty | undefined {
  return prop.type.kind === "ModelProperty" ? (prop.type as ModelProperty) : undefined;
}

export function getMaxValueExclusive(program: Program, prop: ModelProperty): number | undefined {
  const src = lookupSourceProp(prop);
  return (
    tsGetMaxValueExclusive(program, prop) ??
    (src ? tsGetMaxValueExclusive(program, src) : undefined)
  );
}

export function getMinValueExclusive(program: Program, prop: ModelProperty): number | undefined {
  const src = lookupSourceProp(prop);
  return (
    tsGetMinValueExclusive(program, prop) ??
    (src ? tsGetMinValueExclusive(program, src) : undefined)
  );
}

export function getMaxItems(program: Program, prop: ModelProperty): number | undefined {
  const src = lookupSourceProp(prop);
  return tsGetMaxItems(program, prop) ?? (src ? tsGetMaxItems(program, src) : undefined);
}

export function getMinItems(program: Program, prop: ModelProperty): number | undefined {
  const src = lookupSourceProp(prop);
  return tsGetMinItems(program, prop) ?? (src ? tsGetMinItems(program, src) : undefined);
}

export function getMaxLength(program: Program, prop: ModelProperty): number | undefined {
  const src = lookupSourceProp(prop);
  return tsGetMaxLength(program, prop) ?? (src ? tsGetMaxLength(program, src) : undefined);
}

export function getMinLength(program: Program, prop: ModelProperty): number | undefined {
  const src = lookupSourceProp(prop);
  return tsGetMinLength(program, prop) ?? (src ? tsGetMinLength(program, src) : undefined);
}

export function getMinValue(program: Program, prop: ModelProperty): number | undefined {
  const src = lookupSourceProp(prop);
  return tsGetMinValue(program, prop) ?? (src ? tsGetMinValue(program, src) : undefined);
}

export function getMaxValue(program: Program, prop: ModelProperty): number | undefined {
  const src = lookupSourceProp(prop);
  return tsGetMaxValue(program, prop) ?? (src ? tsGetMaxValue(program, src) : undefined);
}

export function getPattern(program: Program, prop: ModelProperty): string | undefined {
  const src = lookupSourceProp(prop);
  return tsGetPattern(program, prop) ?? (src ? tsGetPattern(program, src) : undefined);
}

/**
 * Returns the TypeSpec @format value, e.g. "email", "uri", "date-time".
 * Used to emit format-specific validators in target languages.
 * Falls back to the source property for lookup types.
 */
export function getFormat(program: Program, prop: ModelProperty): string | undefined {
  const src = lookupSourceProp(prop);
  return tsGetFormat(program, prop) ?? (src ? tsGetFormat(program, src) : undefined);
}

export function getForeignKey(program: Program, prop: ModelProperty): string | undefined {
  return program.stateMap(ForeignKeyKey).get(prop) as string | undefined;
}

export function getMappedBy(program: Program, prop: ModelProperty): string | undefined {
  return program.stateMap(MappedByKey).get(prop) as string | undefined;
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

// ─── DataModel / Form-field helpers ────────────────────────────────────────

export function isData(program: Program, model: Model): boolean {
  return program.stateMap(DataKey).has(model);
}

export function getDataLabel(program: Program, model: Model): string | undefined {
  return program.stateMap(DataKey).get(model) as string | undefined;
}

export function getTitle(program: Program, prop: ModelProperty): string | undefined {
  return program.stateMap(TitleKey).get(prop) as string | undefined;
}

export function collectDataModels(program: Program): { model: Model; label: string }[] {
  const result: { model: Model; label: string }[] = [];
  for (const [node, label] of program.stateMap(DataKey)) {
    if ((node as { kind?: string }).kind === "Model") {
      result.push({ model: node as Model, label: label as string });
    }
  }
  return result;
}

export function getPlaceholder(program: Program, prop: ModelProperty): string | undefined {
  return program.stateMap(PlaceholderKey).get(prop) as string | undefined;
}

export function getInputType(program: Program, scalar: Scalar): string | undefined {
  return program.stateMap(InputTypeKey).get(scalar) as string | undefined;
}

// ─── Doc helper ──────────────────────────────────────────────────────────────

/**
 * Returns the @doc() string for a model or property, if set.
 * Falls back to the source property for lookup types.
 */
export function getDoc(program: Program, target: Model | ModelProperty): string | undefined {
  let raw = tsGetDoc(program, target);
  // Lookup type fallback: inherit @doc from the referenced ModelProperty
  if (!raw && target.kind === "ModelProperty") {
    const source = lookupSourceProp(target);
    if (source) raw = tsGetDoc(program, source);
  }
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
 * Unwraps lookup types (e.g. `User.plan`) to find the underlying enum.
 */
export function getPropertyEnum(
  prop: ModelProperty,
): { enumType: Enum; members: EnumMemberInfo[] } | undefined {
  let type = prop.type;
  // Unwrap lookup types: User.plan → plan.type (the actual Enum)
  if (type.kind === "ModelProperty") {
    type = (type as ModelProperty).type;
  }
  if (!isEnum(type)) return undefined;
  return {
    enumType: type,
    members: getEnumMembers(type),
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

/** Custom scalars defined in @qninhdt/typespec-orm */
const CUSTOM_SCALARS = new Set(["uuid", "text", "jsonb", "serial", "bigserial"]);

/** Standard TypeSpec scalar → canonical DB type mapping */
const STANDARD_SCALAR_MAP: Record<string, string> = {
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

/**
 * Resolve a TypeSpec type to a canonical database type name.
 * Returns undefined for non-scalar types.
 * Unwraps lookup types (ModelProperty references) to find the underlying scalar.
 */
export function resolveDbType(type: Type): string | undefined {
  // Unwrap lookup types: User.email → email.type (the actual Scalar)
  if (type.kind === "ModelProperty") {
    return resolveDbType((type as ModelProperty).type);
  }
  if (type.kind !== "Scalar") return undefined;
  const chain = getScalarChain(type as Scalar);

  for (const name of chain) {
    if (CUSTOM_SCALARS.has(name)) return name;
  }

  for (const name of chain) {
    if (name in STANDARD_SCALAR_MAP) return STANDARD_SCALAR_MAP[name];
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

/** Pre-compiled Go abbreviation replacement patterns (avoids per-call RegExp construction) */
const GO_ABBREVIATION_RULES: { endPattern: RegExp; midPattern: RegExp; to: string }[] = [
  ["Id", "ID"],
  ["Ids", "IDs"],
  ["Url", "URL"],
  ["Urls", "URLs"],
  ["Uri", "URI"],
  ["Uris", "URIs"],
  ["Http", "HTTP"],
  ["Https", "HTTPS"],
  ["Api", "API"],
  ["Uuid", "UUID"],
  ["Sql", "SQL"],
  ["Ip", "IP"],
  ["Tcp", "TCP"],
  ["Udp", "UDP"],
  ["Ssh", "SSH"],
  ["Cpu", "CPU"],
  ["Json", "JSON"],
].map(([from, to]) => ({
  endPattern: new RegExp(`${from}$`),
  midPattern: new RegExp(`${from}(?=[A-Z])`, "g"),
  to,
}));

/** Convert camelCase to PascalCase with Go abbreviation rules */
export function camelToPascal(name: string): string {
  let result = name.charAt(0).toUpperCase() + name.slice(1);

  for (const { endPattern, midPattern, to } of GO_ABBREVIATION_RULES) {
    result = result.replace(endPattern, to);
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
  /** Relation kind */
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
 * Checks for @key (TypeSpec built-in)
 */
export function findPrimaryKey(program: Program, model: Model): ModelProperty | undefined {
  // Check for @key decorator (TypeSpec built-in) - decorators is an array
  for (const [, prop] of model.properties) {
    if (isKey(program, prop)) return prop;
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
 * Resolve a relation from a model property.
 *
 * Relations must be explicitly declared:
 * - many-to-one: `@foreignKey("column_name")` on the Model reference property
 * - one-to-many: `@mappedBy("inverse_property")` on the array property
 *
 * Returns undefined if the property is not a valid relation.
 */
export function resolveRelation(
  program: Program,
  prop: ModelProperty,
  parentModel: Model,
): ResolvedRelation | undefined {
  const onDelete = getOnDelete(program, prop);
  const onUpdate = getOnUpdate(program, prop);
  const explicitFk = getForeignKey(program, prop);
  const explicitMappedBy = getMappedBy(program, prop);

  // Case 1: Singular @table Model reference → many-to-one
  if (prop.type.kind === "Model" && isTable(program, prop.type as Model)) {
    const targetModel = prop.type as Model;
    const targetTable = getTableName(program, targetModel);

    // FK column name is required for many-to-one
    if (!explicitFk) {
      return undefined;
    }

    const fkColumnName = explicitFk;
    const fkTargetColumn = "id";

    // Resolve FK type from target's primary key
    const targetPk = findPrimaryKey(program, targetModel);
    const fkDbType = targetPk ? resolveDbType(targetPk.type) : "uuid";

    // Determine kind: @unique → one-to-one, otherwise → many-to-one
    const hasUnique = isUnique(program, prop);
    const kind = hasUnique ? "one-to-one" : "many-to-one";

    // Find inverse one-to-many on target for back_populates
    const forwardRef = findForwardReference(program, parentModel, targetModel, fkColumnName);

    return {
      kind,
      targetModel,
      targetTable,
      fkColumnName,
      fkTargetColumn,
      fkDbType,
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

    // mappedBy is required for one-to-many
    if (!explicitMappedBy) {
      return undefined;
    }

    // Find the property on target model that has @foreignKey
    const targetProp = targetModel.properties.get(explicitMappedBy);
    if (!targetProp) {
      return undefined;
    }

    const targetFk = getForeignKey(program, targetProp);
    if (!targetFk) {
      return undefined;
    }

    const fkColumnName = targetFk;
    const inverseFkFieldName = camelToPascal(explicitMappedBy + "Id");
    const backPopulates = explicitMappedBy;

    // Get cascade from the inverse property
    const inverseOnDelete = getOnDelete(program, targetProp);
    const inverseOnUpdate = getOnUpdate(program, targetProp);

    return {
      kind: "one-to-many",
      targetModel,
      targetTable,
      fkColumnName,
      fkTargetColumn: "id",
      fkDbType: undefined,
      onDelete: inverseOnDelete ?? onDelete,
      onUpdate: inverseOnUpdate ?? onUpdate,
      inverseFkFieldName,
      backPopulates,
    };
  }

  return undefined;
}

/**
 * Find the forward-reference (one-to-many) on targetModel that collects parentModel.
 * Used for SQLModel back_populates on the many-to-one side.
 */
function findForwardReference(
  program: Program,
  parentModel: Model,
  targetModel: Model,
  fkColumnName: string,
): string | undefined {
  // Search on targetModel for one-to-many arrays that collect parentModel
  for (const [, prop] of targetModel.properties) {
    const arrElement = unwrapArrayType(prop.type);
    if (arrElement && arrElement === parentModel) {
      // Check if this array has @mappedBy pointing to a property with matching FK column
      const mappedBy = getMappedBy(program, prop);
      if (mappedBy) {
        const targetProp = parentModel.properties.get(mappedBy);
        if (targetProp) {
          const targetFk = getForeignKey(program, targetProp);
          if (targetFk === fkColumnName) {
            return camelToSnake(prop.name);
          }
        }
      }
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
