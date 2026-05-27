import type { Model, ModelProperty, Program } from "@typespec/compiler";
import {
  ORM_NAMESPACE,
  TableKey,
  TableMixinKey,
  MapKey,
  IndexKey,
  UniqueKey,
  CheckKey,
  AutoIncrementKey,
  IgnoreKey,
  NoDefaultKey,
} from "./lib.js";
import { truncatePgIdentifier } from "./identifier-policy.js";
import { camelToSnake, deriveTableName } from "./naming.js";
import { getNamespaceFullName, isBuiltIn } from "./state-types.js";

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
  // Honor the override passed to @unique("name") if present.
  const stored = program.stateMap(UniqueKey).get(prop);
  if (typeof stored === "string" && stored !== "") {
    return truncatePgIdentifier(stored);
  }
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

export function getDefaultValue(_program: Program, prop: ModelProperty): string | undefined {
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
  return getColumnName(program, prop) === "deleted_at";
}

export function isIgnored(program: Program, prop: ModelProperty): boolean {
  return program.stateMap(IgnoreKey).has(prop);
}

/**
 * Returns true when the property carries `@noDefault`. Emitters MUST suppress
 * any auto-default they would otherwise inject (e.g. `Default(uuid.New)` on
 * `@key uuid` columns) when this is set.
 */
export function isNoDefault(program: Program, prop: ModelProperty): boolean {
  return program.stateMap(NoDefaultKey).has(prop);
}
