import type { DecoratorContext, ModelProperty } from "@typespec/compiler";
import {
  MapKey,
  IndexKey,
  UniqueKey,
  CheckKey,
  AutoIncrementKey,
  AutoCreateTimeKey,
  AutoUpdateTimeKey,
  PrecisionKey,
  IgnoreKey,
  DefaultExpressionKey,
  VersionKey,
  IndexUsingKey,
  PartialIndexKey,
  GoTypeKey,
  NoDefaultKey,
} from "./lib.js";

export function $map(context: DecoratorContext, target: ModelProperty, columnName: string): void {
  context.program.stateMap(MapKey).set(target, columnName);
}

export function $index(context: DecoratorContext, target: ModelProperty, name?: string): void {
  // Store the override verbatim. Undefined means "auto-derive
  // [tableName]_[columnName]_idx in getIndexName".
  context.program.stateMap(IndexKey).set(target, name);
}

export function $unique(context: DecoratorContext, target: ModelProperty, name?: string): void {
  // Same contract as @index: undefined means auto-derive.
  context.program.stateMap(UniqueKey).set(target, name);
}

export function $check(
  context: DecoratorContext,
  target: ModelProperty,
  name: string,
  expression: string,
): void {
  context.program.stateMap(CheckKey).set(target, { name, expression });
}

export function $autoIncrement(context: DecoratorContext, target: ModelProperty): void {
  context.program.stateMap(AutoIncrementKey).set(target, true);
}

export function $autoCreateTime(context: DecoratorContext, target: ModelProperty): void {
  context.program.stateMap(AutoCreateTimeKey).set(target, true);
}

export function $autoUpdateTime(context: DecoratorContext, target: ModelProperty): void {
  context.program.stateMap(AutoUpdateTimeKey).set(target, true);
}

export function $precision(
  context: DecoratorContext,
  target: ModelProperty,
  precision: number,
  scale?: number,
): void {
  // Postgres NUMERIC(precision) defaults scale to 0 when omitted.
  context.program.stateMap(PrecisionKey).set(target, {
    precision,
    scale: scale ?? 0,
  });
}

export function $ignore(context: DecoratorContext, target: ModelProperty): void {
  context.program.stateMap(IgnoreKey).set(target, true);
}

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

/**
 * Marks a column as the optimistic-locking version. Emitters render this as
 * `__mapper_args__ = {"version_id_col": ...}` (SQLModel) or hooks (Ent).
 * Only one column per model may carry this decorator (validated downstream).
 */
export function $version(context: DecoratorContext, target: ModelProperty): void {
  context.program.stateMap(VersionKey).set(target, true);
}

export function $indexUsing(
  context: DecoratorContext,
  target: ModelProperty,
  method: string,
): void {
  context.program.stateMap(IndexUsingKey).set(target, method);
}

/**
 * Adds a partial-index predicate to a column-level index. Combines with
 * `@index`, `@unique`, or `@key`. The predicate string is rendered verbatim
 * by emitters that support partial indexes.
 */
export function $partialIndex(
  context: DecoratorContext,
  target: ModelProperty,
  predicate: string,
): void {
  context.program.stateMap(PartialIndexKey).set(target, predicate);
}

export interface GoTypeSpec {
  importPath: string;
  typeName: string;
  raw: string;
}

export function $goType(
  context: DecoratorContext,
  target: ModelProperty,
  importPathAndType: string,
): void {
  // Format: import/path.TypeName — split at the LAST dot before the symbol so
  // dotted package paths (`github.com/foo/bar/v2.MyType`) still parse.
  const lastDot = importPathAndType.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === importPathAndType.length - 1) {
    context.program.stateMap(GoTypeKey).set(target, {
      importPath: "",
      typeName: "",
      raw: importPathAndType,
    });
    return;
  }
  const importPath = importPathAndType.slice(0, lastDot);
  const typeName = importPathAndType.slice(lastDot + 1);
  context.program.stateMap(GoTypeKey).set(target, {
    importPath,
    typeName,
    raw: importPathAndType,
  });
}

/**
 * Marks a property as caller-assigned. Emitters MUST suppress any auto-default
 * (e.g. `Default(uuid.New)` for `@key uuid` columns). Has no effect when the
 * property carries an explicit default — those win on their own.
 */
export function $noDefault(context: DecoratorContext, target: ModelProperty): void {
  context.program.stateMap(NoDefaultKey).set(target, true);
}
