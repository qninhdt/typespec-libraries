import type { DecoratorContext, ModelProperty } from "@typespec/compiler";
import {
  MapKey,
  IndexKey,
  UniqueKey,
  CheckKey,
  AutoIncrementKey,
  SoftDeleteKey,
  AutoCreateTimeKey,
  AutoUpdateTimeKey,
  PrecisionKey,
  IgnoreKey,
  DefaultExpressionKey,
  VersionKey,
  AuditKey,
  TenantIdKey,
  IndexUsingKey,
  GoTypeKey,
} from "./lib.js";

export function $map(context: DecoratorContext, target: ModelProperty, columnName: string): void {
  context.program.stateMap(MapKey).set(target, columnName);
}

export function $index(context: DecoratorContext, target: ModelProperty, name?: string): void {
  // Auto-generate name from table name + column name if not specified
  // Name format: [tableName]_[columnName]_idx
  context.program.stateMap(IndexKey).set(target, name ?? "");
}

export function $unique(context: DecoratorContext, target: ModelProperty, name?: string): void {
  context.program.stateMap(UniqueKey).set(target, name ?? "");
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

export function $softDelete(context: DecoratorContext, target: ModelProperty): void {
  context.program.stateMap(SoftDeleteKey).set(target, true);
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

/**
 * Marks a column as the tenant scope. Downstream emitters use this to scaffold
 * multi-tenant policies / row-level security helpers.
 */
export function $tenantId(context: DecoratorContext, target: ModelProperty): void {
  context.program.stateMap(TenantIdKey).set(target, true);
}

export function $indexUsing(
  context: DecoratorContext,
  target: ModelProperty,
  method: string,
): void {
  context.program.stateMap(IndexUsingKey).set(target, method);
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
