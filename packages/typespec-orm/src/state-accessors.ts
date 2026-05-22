/**
 * Decorator state accessors. These wrap `program.stateMap(...)` so the rest
 * of the package can introspect models without touching state keys directly.
 *
 * Pure decorator readers live here; anything that walks relations or
 * inheritance chains has its own module.
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
  ORM_NAMESPACE,
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
  SchemaKey,
  DefaultExpressionKey,
  VersionKey,
  AuditKey,
  TenantIdKey,
  ScopesKey,
  OwnerKey,
  ClassificationKey,
  DataKey,
  TitleKey,
  PlaceholderKey,
  InputTypeKey,
} from "./lib.js";
import { truncatePgIdentifier } from "./identifier-policy.js";
import { camelToSnake, deriveTableName } from "./naming.js";
import {
  DB_SCALARS,
  getCustomScalarName,
  getOrmScalarName,
  lookupSourceProp,
  resolveDbType,
  withLookupFallback,
} from "./scalar-resolution.js";

// ─── Namespace / type-name helpers ───────────────────────────────────────────

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

/** True if the given type is defined in the built-in TypeSpec namespace. */
export function isBuiltIn(program: Program, type: Type): boolean {
  if (type.kind === "ModelProperty" && type.model) {
    type = type.model;
  }

  if (!("namespace" in type) || type.namespace === undefined) {
    return false;
  }

  const globalNs = program.getGlobalNamespaceType();
  let tln = type.namespace;
  if (tln === globalNs) {
    return false;
  }

  while (tln && tln.namespace && tln.namespace !== globalNs) {
    tln = tln.namespace;
  }

  return tln === globalNs.namespaces.get("TypeSpec");
}

/**
 * Returns true if the scalar is a custom scalar.
 * A custom scalar is not a TypeSpec built-in primitive and not a DB-specific scalar.
 */
export function isCustomScalar(program: Program, type: Type): boolean {
  if (type.kind !== "Scalar") return false;
  if (getOrmScalarName(type) !== undefined) return true;
  if (isBuiltIn(program, type)) return false;
  const dbType = resolveDbType(type);
  if (dbType && DB_SCALARS.has(dbType)) return false;
  return true;
}

/** Collect all custom scalars referenced by a TypeSpec model. */
export function collectCustomScalars(program: Program, model: Model): Set<Scalar> {
  const scalars = new Set<Scalar>();
  for (const prop of walkPropertiesInherited(model)) {
    let current: Type | undefined = prop.type;
    if (current.kind === "ModelProperty") current = current.type;
    if (current.kind === "Scalar" && isCustomScalar(program, current)) {
      scalars.add(current);
    }
  }
  return scalars;
}

// ─── Table helpers ───────────────────────────────────────────────────────────

export function isTable(program: Program, model: Model): boolean {
  return program.stateMap(TableKey).has(model);
}

export function isTableMixin(program: Program, model: Model): boolean {
  return program.stateMap(TableMixinKey).has(model);
}

export function isOrmManagedModel(program: Program, model: Model): boolean {
  if (!model.name || !model.namespace) return false;
  if (isBuiltIn(program, model)) return false;
  const namespace = getNamespaceFullName(model.namespace, program.getGlobalNamespaceType());
  return namespace !== undefined && namespace !== ORM_NAMESPACE;
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
  const stored = program.stateMap(IndexKey).get(prop) as string | undefined;
  if (stored !== undefined && stored !== "") {
    return truncatePgIdentifier(stored);
  }
  // Auto-derive index name: [tableName]_[columnName]_idx
  const model = prop.model;
  if (!model) return "";
  const tableName = getTableName(program, model);
  const columnName = getColumnName(program, prop);
  return truncatePgIdentifier(`${tableName}_${columnName}_idx`);
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
  return truncatePgIdentifier(`${tableName}_${columnName}_unique`);
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

/** Primary key check (TypeSpec built-in `@key`). */
export function isKey(program: Program, prop: ModelProperty): boolean {
  return tsIsKey(program, prop);
}

export function isArrayType(type: Type): boolean {
  return type.kind === "Model" && type.indexer !== undefined;
}

export function getArrayElementType(type: Type): Type | undefined {
  if (type.kind === "Model" && type.indexer) {
    return type.indexer.value;
  }
  return undefined;
}

// ─── Validation accessors with lookup / scalar-chain fallback ────────────────

export const getMaxValueExclusive = withLookupFallback(tsGetMaxValueExclusive);
export const getMinValueExclusive = withLookupFallback(tsGetMinValueExclusive);
export const getMaxItems = withLookupFallback(tsGetMaxItems);
export const getMinItems = withLookupFallback(tsGetMinItems);
export const getMaxLength = withLookupFallback(tsGetMaxLength);
export const getMinLength = withLookupFallback(tsGetMinLength);
export const getMinValue = withLookupFallback(tsGetMinValue);
export const getMaxValue = withLookupFallback(tsGetMaxValue);
export const getPattern = withLookupFallback(tsGetPattern);

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

  const customScalarName = getCustomScalarName(prop.type);
  if (customScalarName) validators.push({ name: "customScalar", args: customScalarName });

  return validators;
}

// ─── Foreign-key configuration ───────────────────────────────────────────────

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

// ─── Composite scalar helpers ───────────────────────────────────────────────

export function getCompositeFields(program: Program, prop: ModelProperty): string[] | undefined {
  const type = prop.type;

  // Handle scalar-based composite type (composite<field1, field2>)
  if (type.kind !== "Scalar" || getCompositeScalarName(type) !== "composite") {
    return undefined;
  }

  return getCompositeTemplateColumns(type);
}

function getCompositeScalarName(type: Scalar): string | undefined {
  if (type.name) return type.name;
  const node = (type as Scalar & { node?: { id?: { escapedText?: string } } }).node;
  return node?.id?.escapedText;
}

function getCompositeTemplateColumns(type: Scalar): string[] | undefined {
  const mapper = (type as Scalar & { templateMapper?: { args?: unknown } }).templateMapper;
  const args = mapper?.args;
  if (!args || !Array.isArray(args)) {
    return undefined;
  }

  const columns: string[] = [];
  for (const arg of args) {
    if (!arg || typeof arg !== "object" || !("type" in arg)) {
      continue;
    }

    const typeObj = (arg as { type: unknown }).type as
      | { kind: string; value?: string }
      | undefined;
    if (typeObj?.kind === "String" && typeObj.value) {
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

/**
 * Returns the PostgreSQL schema for a `@table` model.
 * Looks up the model first, then walks up the namespace chain.
 * Returns `undefined` when no `@schema` decorator applies (default `public`).
 */
export function getSchemaName(program: Program, target: Model): string | undefined {
  const direct = program.stateMap(SchemaKey).get(target) as string | undefined;
  if (direct !== undefined) return direct;
  let ns = target.namespace;
  while (ns) {
    const found = program.stateMap(SchemaKey).get(ns) as string | undefined;
    if (found !== undefined) return found;
    ns = ns.namespace;
  }
  return undefined;
}

/** Returns the SQL default expression set via `@defaultExpression`, if any. */
export function getDefaultExpression(
  program: Program,
  prop: ModelProperty,
): string | undefined {
  return program.stateMap(DefaultExpressionKey).get(prop) as string | undefined;
}

/** Returns true when the property carries `@version` for optimistic locking. */
export function isVersionColumn(program: Program, prop: ModelProperty): boolean {
  return program.stateMap(VersionKey).has(prop);
}

/** Returns the audit role (`"createdBy"` / `"updatedBy"`) set via `@audit`, if any. */
export function getAuditRole(
  program: Program,
  prop: ModelProperty,
): "createdBy" | "updatedBy" | undefined {
  return program.stateMap(AuditKey).get(prop) as "createdBy" | "updatedBy" | undefined;
}

/** Returns true when the property carries `@tenantId`. */
export function isTenantIdColumn(program: Program, prop: ModelProperty): boolean {
  return program.stateMap(TenantIdKey).has(prop);
}

/** Finds the `@version` column on a model, or undefined. */
export function findVersionProperty(program: Program, model: Model): ModelProperty | undefined {
  for (const prop of model.properties.values()) {
    if (isVersionColumn(program, prop)) return prop;
  }
  return undefined;
}

/** Finds the `@tenantId` column on a model, or undefined. */
export function findTenantIdProperty(program: Program, model: Model): ModelProperty | undefined {
  for (const prop of model.properties.values()) {
    if (isTenantIdColumn(program, prop)) return prop;
  }
  return undefined;
}

// ─── Catalog metadata helpers ────────────────────────────────────────────────

/** Returns the scopes applied to a model or property via `@scope`. Empty array if none. */
export function getScopes(program: Program, target: Model | ModelProperty): readonly string[] {
  return (program.stateMap(ScopesKey).get(target) as string[] | undefined) ?? [];
}

/** True when the model or property carries the given scope. */
export function hasScope(
  program: Program,
  target: Model | ModelProperty,
  scope: string,
): boolean {
  return getScopes(program, target).includes(scope);
}

/** Returns the owning team set via `@owner`, walking up the namespace chain for models. */
export function getOwner(program: Program, target: Model | Namespace): string | undefined {
  const direct = program.stateMap(OwnerKey).get(target) as string | undefined;
  if (direct !== undefined) return direct;
  let ns: Namespace | undefined =
    "namespace" in target ? (target.namespace as Namespace | undefined) : undefined;
  while (ns) {
    const found = program.stateMap(OwnerKey).get(ns) as string | undefined;
    if (found !== undefined) return found;
    ns = ns.namespace;
  }
  return undefined;
}

/** Returns the classification level set via `@classification`. */
export function getClassification(
  program: Program,
  target: Model | ModelProperty,
): string | undefined {
  return program.stateMap(ClassificationKey).get(target) as string | undefined;
}

// ─── Ignore field helper ─────────────────────────────────────────────────────

export function isIgnored(program: Program, prop: ModelProperty): boolean {
  return program.stateMap(IgnoreKey).has(prop);
}

// ─── DataModel / Form-field helpers ─────────────────────────────────────────

export function isData(program: Program, model: Model): boolean {
  return (
    program.stateMap(DataKey).has(model) ||
    (isOrmManagedModel(program, model) && !isTable(program, model) && !isTableMixin(program, model))
  );
}

export function getDataLabel(program: Program, model: Model): string | undefined {
  return program.stateMap(DataKey).get(model) as string | undefined;
}

export function getTitle(program: Program, prop: ModelProperty): string | undefined {
  return program.stateMap(TitleKey).get(prop) as string | undefined;
}

export function getPlaceholder(program: Program, prop: ModelProperty): string | undefined {
  return program.stateMap(PlaceholderKey).get(prop) as string | undefined;
}

export function getInputType(program: Program, scalar: Scalar): string | undefined {
  return program.stateMap(InputTypeKey).get(scalar) as string | undefined;
}

export function getModelOwnProperties(model: Model): ModelProperty[] {
  // `sourceProperty` is an internal compiler field that marks props inherited via
  // `...Mixin` spread. There is no public API for "own props only", so we depend
  // on it directly; if the compiler renames it this returns inherited props too.
  return [...model.properties.values()].filter(
    (prop) => (prop as { sourceProperty?: ModelProperty }).sourceProperty === undefined,
  );
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
  /** Raw enum value before stringification. */
  rawValue?: string | number;
  /** Whether the enum value was authored as a number or string. */
  valueKind?: "string" | "number";
}

/** Check if a property type is a TypeSpec Enum. */
export function isEnum(type: Type): type is Enum {
  return type.kind === "Enum";
}

/** Given an Enum type, return its members as { name, value } pairs. */
export function getEnumMembers(enumType: Enum): EnumMemberInfo[] {
  const members: EnumMemberInfo[] = [];
  for (const [, member] of enumType.members) {
    const rawValue = member.value === undefined ? member.name : member.value;
    members.push({
      name: member.name,
      value: String(rawValue),
      rawValue,
      valueKind: typeof rawValue === "number" ? "number" : "string",
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
  // Unwrap lookup types: User.plan -> plan.type (the actual Enum)
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
