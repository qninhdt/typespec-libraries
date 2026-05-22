import type { DecoratorContext, Model, ModelProperty, Namespace, Scalar } from "@typespec/compiler";
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
  SchemaKey,
  DefaultExpressionKey,
  VersionKey,
  AuditKey,
  TenantIdKey,
  ModelIndexesKey,
  ModelUniquesKey,
  ScopesKey,
  OwnerKey,
  ClassificationKey,
  DataKey,
  TitleKey,
  PlaceholderKey,
  InputTypeKey,
} from "./lib.js";

// ─── @table ──────────────────────────────────────────────────────────────────

export function $table(context: DecoratorContext, target: Model, name?: string): void {
  context.program.stateMap(TableKey).set(target, name ?? "");
}

export function $tableMixin(context: DecoratorContext, target: Model): void {
  context.program.stateMap(TableMixinKey).set(target, true);
}

// ─── @map ────────────────────────────────────────────────────────────────────

export function $map(context: DecoratorContext, target: ModelProperty, columnName: string): void {
  context.program.stateMap(MapKey).set(target, columnName);
}

// ─── @index ──────────────────────────────────────────────────────────────────

export function $index(context: DecoratorContext, target: ModelProperty, name?: string): void {
  // Auto-generate name from table name + column name if not specified
  // Name format: [tableName]_[columnName]_idx
  context.program.stateMap(IndexKey).set(target, name ?? "");
}

// ─── @unique ─────────────────────────────────────────────────────────────────

export function $unique(context: DecoratorContext, target: ModelProperty): void {
  context.program.stateMap(UniqueKey).set(target, true);
}

// ─── @check ──────────────────────────────────────────────────────────────────

export function $check(
  context: DecoratorContext,
  target: ModelProperty,
  name: string,
  expression: string,
): void {
  context.program.stateMap(CheckKey).set(target, { name, expression });
}

// ─── @autoIncrement ──────────────────────────────────────────────────────────

export function $autoIncrement(context: DecoratorContext, target: ModelProperty): void {
  context.program.stateMap(AutoIncrementKey).set(target, true);
}

// ─── @softDelete ─────────────────────────────────────────────────────────────

export function $softDelete(context: DecoratorContext, target: ModelProperty): void {
  context.program.stateMap(SoftDeleteKey).set(target, true);
}

// ─── @foreignKey ─────────────────────────────────────────────────────────────

export function $foreignKey(
  context: DecoratorContext,
  target: ModelProperty,
  field: string,
  referencedField?: string,
): void {
  context.program.stateMap(ForeignKeyKey).set(target, {
    field,
    target: referencedField,
  });
}

// ─── @mappedBy ───────────────────────────────────────────────────────────────

export function $mappedBy(context: DecoratorContext, target: ModelProperty, field: string): void {
  context.program.stateMap(MappedByKey).set(target, field);
}

// ─── @manyToMany ─────────────────────────────────────────────────────────────

export function $manyToMany(
  context: DecoratorContext,
  target: ModelProperty,
  tableName: string,
): void {
  context.program.stateMap(ManyToManyKey).set(target, tableName);
}

// ─── @autoCreateTime ─────────────────────────────────────────────────────────

export function $autoCreateTime(context: DecoratorContext, target: ModelProperty): void {
  context.program.stateMap(AutoCreateTimeKey).set(target, true);
}

// ─── @autoUpdateTime ─────────────────────────────────────────────────────────

export function $autoUpdateTime(context: DecoratorContext, target: ModelProperty): void {
  context.program.stateMap(AutoUpdateTimeKey).set(target, true);
}

// ─── @precision ──────────────────────────────────────────────────────────────

export function $precision(
  context: DecoratorContext,
  target: ModelProperty,
  precision: number,
  scale?: number,
): void {
  context.program.stateMap(PrecisionKey).set(target, {
    precision,
    scale: scale ?? 0,
  });
}

// ─── @onDelete ───────────────────────────────────────────────────────────────

export function $onDelete(context: DecoratorContext, target: ModelProperty, action: string): void {
  context.program.stateMap(OnDeleteKey).set(target, action);
}

// ─── @onUpdate ───────────────────────────────────────────────────────────────

export function $onUpdate(context: DecoratorContext, target: ModelProperty, action: string): void {
  context.program.stateMap(OnUpdateKey).set(target, action);
}

// ─── @ignore ─────────────────────────────────────────────────────────────────

export function $ignore(context: DecoratorContext, target: ModelProperty): void {
  context.program.stateMap(IgnoreKey).set(target, true);
}

// ─── @schema ─────────────────────────────────────────────────────────────────

/**
 * PostgreSQL schema scope for a `@table` model or namespace. Model-level value
 * wins over a namespace-level value.
 */
export function $schema(
  context: DecoratorContext,
  target: Model | Namespace,
  name: string,
): void {
  context.program.stateMap(SchemaKey).set(target, name);
}

// ─── @defaultExpression ──────────────────────────────────────────────────────

/**
 * Stores a SQL default expression for a column. Emitters render this as
 * `server_default=text(...)` (SQLModel) or equivalent on each target.
 */
export function $defaultExpression(
  context: DecoratorContext,
  target: ModelProperty,
  expression: string,
): void {
  context.program.stateMap(DefaultExpressionKey).set(target, expression);
}

// ─── @version ────────────────────────────────────────────────────────────────

/**
 * Marks a column as the optimistic-locking version. Emitters render this as
 * `__mapper_args__ = {"version_id_col": ...}` (SQLModel) or hooks (Ent).
 * Only one column per model may carry this decorator (validated downstream).
 */
export function $version(context: DecoratorContext, target: ModelProperty): void {
  context.program.stateMap(VersionKey).set(target, true);
}

// ─── @audit ──────────────────────────────────────────────────────────────────

/**
 * Marks a column as an audit field. `role` selects which lifecycle hook
 * the emitter wires: "createdBy" / "updatedBy".
 */
export function $audit(
  context: DecoratorContext,
  target: ModelProperty,
  role: "createdBy" | "updatedBy",
): void {
  context.program.stateMap(AuditKey).set(target, role);
}

// ─── @tenantId ───────────────────────────────────────────────────────────────

/**
 * Marks a column as the tenant scope. Downstream emitters use this to scaffold
 * multi-tenant policies / row-level security helpers.
 */
export function $tenantId(context: DecoratorContext, target: ModelProperty): void {
  context.program.stateMap(TenantIdKey).set(target, true);
}

// ─── @scope / @owner / @classification (catalog metadata) ───────────────────

/**
 * Scope a model or property for selector matching. Multiple `@scope`
 * decorators accumulate. Scopes drive emitter `include`/`exclude` selectors
 * of the form `#scopeName`.
 */
export function $scope(
  context: DecoratorContext,
  target: Model | ModelProperty,
  name: string,
): void {
  const map = context.program.stateMap(ScopesKey);
  const existing = (map.get(target) as string[] | undefined) ?? [];
  if (!existing.includes(name)) {
    existing.push(name);
  }
  map.set(target, existing);
}

/**
 * Records the owning team / squad for a model or namespace. Catalog tools
 * read this to attach SLA + on-call metadata to the generated schema.
 */
export function $owner(
  context: DecoratorContext,
  target: Model | Namespace,
  team: string,
): void {
  context.program.stateMap(OwnerKey).set(target, team);
}

/**
 * Records data classification for a model or column (e.g. "public",
 * "internal", "pii", "secret"). Catalog tools and downstream policies
 * consume this verbatim — emitters do not normalize the value.
 */
export function $classification(
  context: DecoratorContext,
  target: Model | ModelProperty,
  level: string,
): void {
  context.program.stateMap(ClassificationKey).set(target, level);
}

// ─── @@tableIndex / @@tableUnique (model-level augments) ─────────────────────

export interface ModelIndexSpec {
  columns: string[];
  name?: string;
}

/**
 * Model-level multi-column index. Use as `@@tableIndex(MyModel, ["a", "b"])`.
 * Replaces the fragile `composite<col1, col2>` scalar trick with a first-class
 * augment that supports any number of columns and an optional explicit name.
 */
export function $tableIndex(
  context: DecoratorContext,
  target: Model,
  columns: string[],
  name?: string,
): void {
  const map = context.program.stateMap(ModelIndexesKey);
  const existing = (map.get(target) as ModelIndexSpec[] | undefined) ?? [];
  existing.push({ columns, name });
  map.set(target, existing);
}

/**
 * Model-level multi-column unique constraint. Use as
 * `@@tableUnique(MyModel, ["a", "b"])`.
 */
export function $tableUnique(
  context: DecoratorContext,
  target: Model,
  columns: string[],
  name?: string,
): void {
  const map = context.program.stateMap(ModelUniquesKey);
  const existing = (map.get(target) as ModelIndexSpec[] | undefined) ?? [];
  existing.push({ columns, name });
  map.set(target, existing);
}

// ─── @data ────────────────────────────────────────────────────────────────

/**
 * Mark a model as a non-database data shape (form payload, API response DTO, etc.).
 * Unlike @table, this does NOT generate a DB schema.
 */
export function $data(context: DecoratorContext, target: Model, label?: string): void {
  context.program.stateMap(DataKey).set(target, label ?? target.name);
}

// ─── @title ────────────────────────────────────────────────────────────────

/** Human-readable title for a form field (maps to Pydantic Field(title=...) / Go form tag). */
export function $title(context: DecoratorContext, target: ModelProperty, text: string): void {
  context.program.stateMap(TitleKey).set(target, text);
}

// ─── @placeholder ─────────────────────────────────────────────────

/** Placeholder text shown inside an input before the user types. */
export function $placeholder(context: DecoratorContext, target: ModelProperty, text: string): void {
  context.program.stateMap(PlaceholderKey).set(target, text);
}

// ─── @inputType ──────────────────────────────────────────────────

/**
 * HTML input type override for string-based scalars (e.g. "email", "url", "tel").
 * Intentionally targets Scalar (not ModelProperty) - see the derived.tsp example
 * for the @@inputType(Model.field::type, ...) augment pattern needed when the
 * property uses a lookup type.
 */
export function $inputType(context: DecoratorContext, target: Scalar, htmlType: string): void {
  context.program.stateMap(InputTypeKey).set(target, htmlType);
}
