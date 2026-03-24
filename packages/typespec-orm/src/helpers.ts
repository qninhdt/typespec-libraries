/**
 * Helper / accessor functions for reading decorator state.
 * Emitters import these to introspect models without touching state keys directly.
 */

import type {
  Enum,
  Model,
  ModelProperty,
  Namespace,
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
  walkPropertiesInherited,
} from "@typespec/compiler";
import {
  TableKey,
  TableMixinKey,
  MapKey,
  IndexKey,
  UniqueKey,
  CheckKey,
  AutoIncrementKey,
  SoftDeleteKey,
  ForeignKeyKey,
  MappedByKey,
  ManyToManyKey,
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

export function isTableMixin(program: Program, model: Model): boolean {
  return program.stateMap(TableMixinKey).has(model);
}

export function getTableName(program: Program, model: Model): string {
  const stored = program.stateMap(TableKey).get(model) as string | undefined;
  if (stored) return stored;
  return deriveTableName(model.name);
}

export function getNamespaceSegments(
  namespace: Namespace | undefined,
  globalNamespace?: Namespace,
): string[] {
  const segments: string[] = [];
  let current = namespace;
  while (current) {
    if (globalNamespace && current === globalNamespace) break;
    if (current.name !== "") {
      segments.push(current.name);
    }
    current = current.namespace;
  }
  return segments.reverse();
}

export function getNamespaceFullName(
  namespace: Namespace | undefined,
  globalNamespace?: Namespace,
): string | undefined {
  const segments = getNamespaceSegments(namespace, globalNamespace);
  return segments.length > 0 ? segments.join(".") : undefined;
}

export function getTypeFullName(
  program: Program,
  type: { name?: string; namespace?: Namespace },
): string {
  if (!type.name) return "";
  const namespace = getNamespaceFullName(type.namespace, program.getGlobalNamespaceType());
  return namespace ? `${namespace}.${type.name}` : type.name;
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
  const stored = program.stateMap(IndexKey).get(prop) as string | undefined;
  if (stored !== undefined && stored !== "") {
    return stored;
  }
  // Auto-derive index name: [tableName]_[columnName]_idx
  const model = prop.model;
  if (!model) return "";
  const tableName = getTableName(program, model);
  const columnName = getColumnName(program, prop);
  return `${tableName}_${columnName}_idx`;
}

export function isUnique(program: Program, prop: ModelProperty): boolean {
  return program.stateMap(UniqueKey).has(prop);
}

export function getUniqueName(program: Program, prop: ModelProperty): string {
  // Auto-derive unique constraint name: [tableName]_[columnName]_unique
  const model = prop.model;
  if (!model) return "";
  const tableName = getTableName(program, model);
  const columnName = getColumnName(program, prop);
  return `${tableName}_${columnName}_unique`;
}

export interface CheckConstraintInfo {
  name: string;
  expression: string;
}

export function getCheck(program: Program, prop: ModelProperty): CheckConstraintInfo | undefined {
  return program.stateMap(CheckKey).get(prop) as CheckConstraintInfo | undefined;
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
        if (builtin.value.value === undefined) {
          return builtin.value.name;
        }
        return String(builtin.value.value);
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
  return type.kind === "Model" && type.indexer !== undefined;
}

export function getArrayElementType(type: Type): Type | undefined {
  // In TypeSpec, arrays are Models with an indexer
  if (type.kind === "Model") {
    if (type.indexer) {
      return type.indexer.value;
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
  const validatorEntries: Array<[string, unknown]> = [
    ["maxLength", getMaxLength(program, prop)],
    ["minLength", getMinLength(program, prop)],
    ["maxValue", getMaxValue(program, prop)],
    ["minValue", getMinValue(program, prop)],
    ["maxValueExclusive", getMaxValueExclusive(program, prop)],
    ["minValueExclusive", getMinValueExclusive(program, prop)],
    ["maxItems", getMaxItems(program, prop)],
    ["minItems", getMinItems(program, prop)],
  ];
  for (const [name, value] of validatorEntries) {
    if (value !== undefined) {
      validators.push({
        name,
        args: typeof value === "object" ? JSON.stringify(value) : `${value}`,
      });
    }
  }

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
  return prop.type.kind === "ModelProperty" ? prop.type : undefined;
}

/**
 * Create a getter that reads a TypeSpec intrinsic value from the property,
 * falling back to the lookup-source property when the direct read is undefined.
 * Eliminates the repeated `const src = lookupSourceProp(prop); return … ?? …`
 * boilerplate across all validation-getter wrappers.
 */
function withLookupFallback<T>(
  getter: (program: Program, target: ModelProperty) => T | undefined,
): (program: Program, prop: ModelProperty) => T | undefined {
  return (program, prop) => {
    const direct = getter(program, prop);
    if (direct !== undefined) return direct;
    const src = lookupSourceProp(prop);
    return src ? getter(program, src) : undefined;
  };
}

export const getMaxValueExclusive = withLookupFallback(tsGetMaxValueExclusive);
export const getMinValueExclusive = withLookupFallback(tsGetMinValueExclusive);
export const getMaxItems = withLookupFallback(tsGetMaxItems);
export const getMinItems = withLookupFallback(tsGetMinItems);
export const getMaxLength = withLookupFallback(tsGetMaxLength);
export const getMinLength = withLookupFallback(tsGetMinLength);
export const getMinValue = withLookupFallback(tsGetMinValue);
export const getMaxValue = withLookupFallback(tsGetMaxValue);
export const getPattern = withLookupFallback(tsGetPattern);

/**
 * Returns the TypeSpec @format value, e.g. "email", "uri", "date-time".
 * Used to emit format-specific validators in target languages.
 * Falls back to the source property for lookup types.
 */
export const getFormat = withLookupFallback(tsGetFormat);

export interface ForeignKeyConfig {
  field: string;
  target?: string;
}

function normalizeForeignKeyConfig(value: unknown): ForeignKeyConfig | undefined {
  if (!value) return undefined;
  if (typeof value === "string") {
    return { field: value };
  }
  if (typeof value === "object" && value !== null) {
    const field = (value as { field?: unknown }).field;
    const target = (value as { target?: unknown }).target;
    if (typeof field === "string") {
      return {
        field,
        target: typeof target === "string" && target !== "" ? target : undefined,
      };
    }
  }
  return undefined;
}

export function getForeignKeyConfig(
  program: Program,
  prop: ModelProperty,
): ForeignKeyConfig | undefined {
  return normalizeForeignKeyConfig(program.stateMap(ForeignKeyKey).get(prop));
}

export function getForeignKey(program: Program, prop: ModelProperty): string | undefined {
  return getForeignKeyConfig(program, prop)?.field;
}

export function getForeignKeyTarget(program: Program, prop: ModelProperty): string | undefined {
  const config = getForeignKeyConfig(program, prop);
  if (!config) return undefined;
  return config.target ?? "id";
}

export function getMappedBy(program: Program, prop: ModelProperty): string | undefined {
  return program.stateMap(MappedByKey).get(prop) as string | undefined;
}

export function getManyToMany(program: Program, prop: ModelProperty): string | undefined {
  return program.stateMap(ManyToManyKey).get(prop) as string | undefined;
}

export function getCompositeFields(program: Program, prop: ModelProperty): string[] | undefined {
  const type = prop.type;

  // Handle scalar-based composite type (composite<field1, field2>)
  if (type.kind !== "Scalar" || getCompositeScalarName(type) !== "composite") {
    return undefined;
  }

  return getCompositeTemplateColumns(type);
}

function getCompositeScalarName(type: Scalar): string | undefined {
  return type.name || (type as any).node?.id?.escapedText;
}

function getCompositeTemplateColumns(type: Scalar): string[] | undefined {
  const args = (type as any).templateMapper?.args;
  if (!args || !Array.isArray(args)) {
    return undefined;
  }

  const columns: string[] = [];
  for (const arg of args) {
    if (!arg || typeof arg !== "object" || !arg.type) {
      continue;
    }

    const typeObj = arg.type;
    if (typeObj.kind === "String" && typeObj.value) {
      columns.push(typeObj.value);
    }
  }

  return columns.length > 0 ? columns : undefined;
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

function getInputTypeForScalar(program: Program, scalar: Scalar): string | undefined {
  let current: Scalar | undefined = scalar;
  while (current) {
    const inputType = getInputType(program, current);
    if (inputType) {
      return inputType;
    }
    current = current.baseScalar;
  }
  return undefined;
}

function inferInputTypeFromFormat(format: string | undefined): string | undefined {
  switch (format) {
    case "email":
      return "email";
    case "uri":
    case "url":
      return "url";
    case "date":
      return "date";
    case "time":
      return "time";
    case "password":
      return "password";
    default:
      return undefined;
  }
}

export function getInputTypeForProperty(program: Program, prop: ModelProperty): string | undefined {
  if (prop.type.kind === "ModelProperty") {
    return getInputTypeForProperty(program, prop.type);
  }

  if (prop.type.kind === "Scalar") {
    const inputType = getInputTypeForScalar(program, prop.type);
    if (inputType) {
      return inputType;
    }
  }

  return inferInputTypeFromFormat(getFormat(program, prop));
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
  return raw.replaceAll(/\r?\n[\t *]*/g, " ").trim();
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
    members.push({
      name: member.name,
      value: member.value === undefined ? member.name : String(member.value),
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
    type = type.type;
  }
  if (isEnum(type)) {
    return {
      enumType: type,
      members: getEnumMembers(type),
    };
  }
  return undefined;
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
    return resolveDbType(type.type);
  }
  if (type.kind !== "Scalar") return undefined;
  const chain = getScalarChain(type);

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
  if (name.length === 0) {
    return name;
  }

  let result = "";

  for (let index = 0; index < name.length; index++) {
    const current = name[index];
    const previous = index > 0 ? name[index - 1] : undefined;
    const next = index + 1 < name.length ? name[index + 1] : undefined;
    const isUpper = current >= "A" && current <= "Z";
    const previousIsLowerOrDigit =
      previous !== undefined &&
      ((previous >= "a" && previous <= "z") || (previous >= "0" && previous <= "9"));
    const previousIsUpper = previous !== undefined && previous >= "A" && previous <= "Z";
    const nextIsLower = next !== undefined && next >= "a" && next <= "z";

    if (isUpper && index > 0 && (previousIsLowerOrDigit || (previousIsUpper && nextIsLower))) {
      result += "_";
    }

    result += current.toLowerCase();
  }

  return result;
}

/** Pre-compiled Go abbreviation replacement patterns (avoids per-call RegExp construction) */
function escapeRegExpLiteral(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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
  endPattern: new RegExp(`${escapeRegExpLiteral(from)}$`),
  midPattern: new RegExp(`${escapeRegExpLiteral(from)}(?=[A-Z])`, "g"),
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
  if (snake.endsWith("s") || snake.endsWith("x") || snake.endsWith("z")) return snake + "es";
  if (snake.endsWith("sh") || snake.endsWith("ch")) return snake + "es";
  // Only convert trailing -y to -ies when preceded by a consonant
  if (snake.endsWith("y") && snake.length > 1 && !/[aeiou]/.test(snake.at(-2) ?? "")) {
    return snake.slice(0, -1) + "ies";
  }
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
  /** The concrete FK-bearing property involved in this relation */
  localProperty: ModelProperty;
  /** The referenced property on the target model */
  targetProperty: ModelProperty;
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
  /** For one-to-many/many-to-one: snake_case inverse relation name (for SQLModel back_populates) */
  backPopulates?: string;
  /** Join table name for many-to-many shorthand */
  joinTable?: string;
}

/**
 * Find the primary key property of a model.
 * Checks for @key (TypeSpec built-in)
 */
export function findPrimaryKey(program: Program, model: Model): ModelProperty | undefined {
  for (const prop of walkPropertiesInherited(model)) {
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
  if (elementType.kind === "Model") return elementType;
  return undefined;
}

export function resolvePropertyReference(
  program: Program,
  model: Model,
  reference: string,
): ModelProperty | undefined {
  for (const prop of walkPropertiesInherited(model)) {
    if (prop.name === reference) {
      return prop;
    }
  }

  for (const prop of walkPropertiesInherited(model)) {
    if (getColumnName(program, prop) === reference) {
      return prop;
    }
  }

  return undefined;
}

function resolvePropertyByName(model: Model, name: string): ModelProperty | undefined {
  for (const prop of walkPropertiesInherited(model)) {
    if (prop.name === name) return prop;
  }
  return undefined;
}

function getComparableTypeId(program: Program, type: Type): string | undefined {
  if (type.kind === "ModelProperty") {
    return getComparableTypeId(program, type.type);
  }
  if (type.kind === "Enum") {
    return `enum:${getTypeFullName(program, type)}`;
  }
  if (type.kind === "Scalar") {
    return `scalar:${resolveDbType(type) ?? getTypeFullName(program, type)}`;
  }
  return undefined;
}

export function describeComparableType(program: Program, prop: ModelProperty): string {
  if (prop.type.kind === "ModelProperty") {
    return describeComparableType(program, prop.type);
  }
  if (prop.type.kind === "Enum") {
    return getTypeFullName(program, prop.type);
  }
  if ("name" in prop.type && typeof prop.type.name === "string") {
    return (
      resolveDbType(prop.type) ??
      getTypeFullName(program, prop.type as { name?: string; namespace?: Namespace }) ??
      prop.type.kind
    );
  }
  return resolveDbType(prop.type) ?? prop.type.kind;
}

export function arePropertyTypesCompatible(
  program: Program,
  left: ModelProperty,
  right: ModelProperty,
): boolean {
  return getComparableTypeId(program, left.type) === getComparableTypeId(program, right.type);
}

export function isRelationLocalKeyUnique(program: Program, prop: ModelProperty): boolean {
  return isKey(program, prop) || isUnique(program, prop);
}

function isModelReferenceTo(type: Type, expected: Model): boolean {
  return type.kind === "Model" ? type === expected : false;
}

function findInverseMappedBy(
  program: Program,
  parentModel: Model,
  targetModel: Model,
  relationPropName: string,
): ModelProperty | undefined {
  for (const prop of walkPropertiesInherited(targetModel)) {
    if (getMappedBy(program, prop) !== relationPropName) continue;
    const arrayElement = unwrapArrayType(prop.type);
    if (arrayElement === parentModel || isModelReferenceTo(prop.type, parentModel)) {
      return prop;
    }
  }
  return undefined;
}

interface ResolvedForeignKeyReference {
  targetModel: Model;
  targetTable: string;
  localProperty: ModelProperty;
  targetProperty: ModelProperty;
  localColumnName: string;
  targetColumnName: string;
  fkDbType: string | undefined;
}

export interface ManyToManyAssociation {
  tableName: string;
  leftModel: Model;
  rightModel: Model;
  leftProperty: ModelProperty;
  rightProperty: ModelProperty;
  leftKey: ModelProperty;
  rightKey: ModelProperty;
  leftJoinColumn: string;
  rightJoinColumn: string;
}

function resolveOwnedRelationReference(
  program: Program,
  relationProp: ModelProperty,
  parentModel: Model,
  targetModel: Model,
): ResolvedForeignKeyReference | undefined {
  const fk = getForeignKeyConfig(program, relationProp);
  if (!fk) return undefined;
  const resolved = resolveRelationProperties(program, parentModel, targetModel, fk);
  if (!resolved) return undefined;
  const { localProperty, targetProperty } = resolved;

  return {
    targetModel,
    targetTable: getTableName(program, targetModel),
    localProperty,
    targetProperty,
    localColumnName: getColumnName(program, localProperty),
    targetColumnName: getColumnName(program, targetProperty),
    fkDbType: resolveDbType(targetProperty.type),
  };
}

function resolveRelationProperties(
  program: Program,
  parentModel: Model,
  targetModel: Model,
  fk: ForeignKeyConfig,
): { localProperty: ModelProperty; targetProperty: ModelProperty } | undefined {
  const localProperty = resolvePropertyReference(program, parentModel, fk.field);
  if (!localProperty) {
    return undefined;
  }

  const targetProperty = resolvePropertyReference(program, targetModel, fk.target ?? "id");
  if (!targetProperty) {
    return undefined;
  }

  return { localProperty, targetProperty };
}

function findInverseManyToMany(
  program: Program,
  parentModel: Model,
  targetModel: Model,
  sourceProp: ModelProperty,
): { prop: ModelProperty; tableName: string } | undefined {
  const joinTable = getManyToMany(program, sourceProp);
  if (!joinTable) return undefined;

  for (const prop of walkPropertiesInherited(targetModel)) {
    const inverseTable = getManyToMany(program, prop);
    if (!inverseTable) continue;
    const inverseTarget = unwrapArrayType(prop.type);
    if (inverseTarget !== parentModel) continue;
    if (inverseTable !== joinTable) continue;
    return { prop, tableName: inverseTable };
  }

  return undefined;
}

export function deriveManyToManyJoinColumnName(
  program: Program,
  model: Model,
  keyProperty: ModelProperty,
): string {
  return `${camelToSnake(model.name)}_${getColumnName(program, keyProperty)}`;
}

export function collectManyToManyAssociations(
  program: Program,
  models: Iterable<Model>,
): ManyToManyAssociation[] {
  const associations = new Map<string, ManyToManyAssociation>();

  for (const model of models) {
    for (const prop of walkPropertiesInherited(model)) {
      const association = buildManyToManyAssociation(program, model, prop);
      if (!association) continue;
      if (associations.has(association.pairKey)) continue;

      associations.set(association.pairKey, association.value);
    }
  }

  return [...associations.values()].sort((a, b) => a.tableName.localeCompare(b.tableName));
}

function buildManyToManyAssociation(
  program: Program,
  model: Model,
  prop: ModelProperty,
): { pairKey: string; value: ManyToManyAssociation } | undefined {
  const joinTable = getManyToMany(program, prop);
  if (!joinTable) return undefined;

  const targetModel = unwrapArrayType(prop.type);
  if (!targetModel || !isTable(program, targetModel)) return undefined;

  const inverse = findInverseManyToMany(program, model, targetModel, prop);
  if (!inverse) return undefined;

  const leftKey = findPrimaryKey(program, model);
  const rightKey = findPrimaryKey(program, targetModel);
  if (!leftKey || !rightKey) return undefined;

  const leftName = getTypeFullName(program, model);
  const rightName = getTypeFullName(program, targetModel);
  const [pairKey, leftFirst] = buildAssociationOrdering(joinTable, leftName, rightName);
  const leftModel = leftFirst ? model : targetModel;
  const rightModel = leftFirst ? targetModel : model;
  const leftProperty = leftFirst ? prop : inverse.prop;
  const rightProperty = leftFirst ? inverse.prop : prop;
  const leftPk = leftFirst ? leftKey : rightKey;
  const rightPk = leftFirst ? rightKey : leftKey;

  return {
    pairKey,
    value: {
      tableName: joinTable,
      leftModel,
      rightModel,
      leftProperty,
      rightProperty,
      leftKey: leftPk,
      rightKey: rightPk,
      leftJoinColumn: deriveManyToManyJoinColumnName(program, leftModel, leftPk),
      rightJoinColumn: deriveManyToManyJoinColumnName(program, rightModel, rightPk),
    },
  };
}

function buildAssociationOrdering(
  joinTable: string,
  leftName: string,
  rightName: string,
): [string, boolean] {
  const leftFirst = leftName <= rightName;
  const pairKey = leftFirst
    ? `${joinTable}:${leftName}:${rightName}`
    : `${joinTable}:${rightName}:${leftName}`;
  return [pairKey, leftFirst];
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
  const explicitFk = getForeignKeyConfig(program, prop);
  const explicitMappedBy = getMappedBy(program, prop);
  const explicitManyToMany = getManyToMany(program, prop);

  const directRelation = resolveDirectRelation(
    program,
    prop,
    parentModel,
    explicitFk,
    onDelete,
    onUpdate,
  );
  if (directRelation) {
    return directRelation;
  }

  const arrayElement = unwrapArrayType(prop.type);

  const manyToManyRelation = resolveManyToManyRelation(
    program,
    prop,
    parentModel,
    arrayElement,
    explicitManyToMany,
  );
  if (manyToManyRelation) {
    return manyToManyRelation;
  }

  // Case 3: @mappedBy on array or singular model reference → inverse collection / has-one
  const mappedByTarget = resolveMappedByTarget(program, prop, arrayElement);

  return resolveMappedByRelation({
    program,
    parentModel,
    arrayElement,
    mappedByTarget,
    explicitMappedBy,
    onDelete,
    onUpdate,
  });
}

function resolveDirectRelation(
  program: Program,
  prop: ModelProperty,
  parentModel: Model,
  explicitFk: ForeignKeyConfig | undefined,
  onDelete: string | undefined,
  onUpdate: string | undefined,
): ResolvedRelation | undefined {
  if (prop.type.kind !== "Model" || !isTable(program, prop.type) || !explicitFk) {
    return undefined;
  }

  const targetModel = prop.type;
  const resolved = resolveOwnedRelationReference(program, prop, parentModel, targetModel);
  if (!resolved) {
    return undefined;
  }

  const kind = isRelationLocalKeyUnique(program, resolved.localProperty)
    ? "one-to-one"
    : "many-to-one";
  const inverseRef = findInverseMappedBy(program, parentModel, targetModel, prop.name);

  return {
    kind,
    ...resolved,
    fkColumnName: resolved.localColumnName,
    fkTargetColumn: resolved.targetColumnName,
    onDelete,
    onUpdate,
    backPopulates: inverseRef ? camelToSnake(inverseRef.name) : undefined,
  };
}

function resolveManyToManyRelation(
  program: Program,
  prop: ModelProperty,
  parentModel: Model,
  arrayElement: Model | undefined,
  explicitManyToMany: string | undefined,
): ResolvedRelation | undefined {
  if (!arrayElement || !isTable(program, arrayElement) || !explicitManyToMany) {
    return undefined;
  }

  const inverse = findInverseManyToMany(program, parentModel, arrayElement, prop);
  if (!inverse) {
    return undefined;
  }

  const localPk = findPrimaryKey(program, parentModel);
  const targetPk = findPrimaryKey(program, arrayElement);
  if (!localPk || !targetPk) {
    return undefined;
  }

  return {
    kind: "many-to-many",
    targetModel: arrayElement,
    targetTable: getTableName(program, arrayElement),
    localProperty: localPk,
    targetProperty: targetPk,
    fkColumnName: getColumnName(program, localPk),
    fkTargetColumn: getColumnName(program, targetPk),
    fkDbType: resolveDbType(targetPk.type),
    backPopulates: camelToSnake(inverse.prop.name),
    joinTable: explicitManyToMany,
  };
}

function resolveMappedByRelation(context: {
  program: Program;
  parentModel: Model;
  arrayElement: Model | undefined;
  mappedByTarget: Model | undefined;
  explicitMappedBy: string | undefined;
  onDelete: string | undefined;
  onUpdate: string | undefined;
}): ResolvedRelation | undefined {
  const {
    program,
    parentModel,
    arrayElement,
    mappedByTarget,
    explicitMappedBy,
    onDelete,
    onUpdate,
  } = context;
  if (!mappedByTarget || !explicitMappedBy) {
    return undefined;
  }

  const targetProp = resolvePropertyByName(mappedByTarget, explicitMappedBy);
  if (!targetProp) {
    return undefined;
  }

  const resolved = resolveOwnedRelationReference(program, targetProp, mappedByTarget, parentModel);
  if (!resolved) {
    return undefined;
  }

  return {
    kind: arrayElement ? "one-to-many" : "one-to-one",
    targetModel: mappedByTarget,
    targetTable: getTableName(program, mappedByTarget),
    localProperty: resolved.localProperty,
    targetProperty: resolved.targetProperty,
    fkColumnName: resolved.localColumnName,
    fkTargetColumn: resolved.targetColumnName,
    fkDbType: resolved.fkDbType,
    onDelete: getOnDelete(program, targetProp) ?? onDelete,
    onUpdate: getOnUpdate(program, targetProp) ?? onUpdate,
    backPopulates: explicitMappedBy,
  };
}

function resolveMappedByTarget(
  program: Program,
  prop: ModelProperty,
  arrayElement: Model | undefined,
): Model | undefined {
  if (arrayElement && isTable(program, arrayElement)) {
    return arrayElement;
  }

  if (prop.type.kind === "Model" && isTable(program, prop.type)) {
    return prop.type;
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
      const tableName = (name as string | undefined) || deriveTableName(type.name);
      const model = type;
      tables.push({ model, tableName });
    }
  }
  tables.sort((a, b) => a.tableName.localeCompare(b.tableName));
  return tables;
}

export function collectTableMixins(program: Program): Model[] {
  const mixins: Model[] = [];
  for (const [type] of program.stateMap(TableMixinKey)) {
    if (type.kind === "Model") {
      mixins.push(type);
    }
  }
  mixins.sort((a, b) => getTypeFullName(program, a).localeCompare(getTypeFullName(program, b)));
  return mixins;
}
