import type { Model, ModelProperty, Program, Scalar } from "@typespec/compiler";
import {
  ForeignKeyKey,
  MappedByKey,
  ManyToManyKey,
  ManyToManyOwnerKey,
  OnDeleteKey,
  OnUpdateKey,
  SchemaKey,
  DefaultExpressionKey,
  VersionKey,
  PolymorphicKey,
  IndexUsingKey,
  PartialIndexKey,
  GoTypeKey,
  RefineKey,
} from "./lib.js";

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

/** Returns true when `@manyToManyOwner` was applied to this property. */
export function isManyToManyOwner(program: Program, prop: ModelProperty): boolean {
  return program.stateMap(ManyToManyOwnerKey).has(prop);
}

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
export function getDefaultExpression(program: Program, prop: ModelProperty): string | undefined {
  return program.stateMap(DefaultExpressionKey).get(prop) as string | undefined;
}

/** Returns true when the property carries `@version` for optimistic locking. */
export function isVersionColumn(program: Program, prop: ModelProperty): boolean {
  return program.stateMap(VersionKey).has(prop);
}

/** Finds the `@version` column on a model, or undefined. */
export function findVersionProperty(program: Program, model: Model): ModelProperty | undefined {
  for (const prop of model.properties.values()) {
    if (isVersionColumn(program, prop)) return prop;
  }
  return undefined;
}

export interface PolymorphicConfig {
  allowedTypes: string[];
  idColumn?: string;
}

export function getPolymorphicConfig(
  program: Program,
  prop: ModelProperty,
): PolymorphicConfig | undefined {
  const value = program.stateMap(PolymorphicKey).get(prop) as PolymorphicConfig | undefined;
  if (!value) return undefined;
  return {
    allowedTypes: [...value.allowedTypes],
    idColumn: value.idColumn,
  };
}

export function isPolymorphicProperty(program: Program, prop: ModelProperty): boolean {
  return program.stateMap(PolymorphicKey).has(prop);
}

export type IndexMethod = "btree" | "gin" | "gist" | "brin" | "hash" | "spgist";

export function getIndexUsing(program: Program, prop: ModelProperty): IndexMethod | undefined {
  return program.stateMap(IndexUsingKey).get(prop) as IndexMethod | undefined;
}

/**
 * Returns the partial-index predicate set via `@partialIndex(...)`. Combines
 * with `@index`, `@unique`, or `@key` on the same property; emitters drop the
 * predicate (with a warning) when the property carries no index decorator.
 */
export function getPartialIndex(program: Program, prop: ModelProperty): string | undefined {
  return program.stateMap(PartialIndexKey).get(prop) as string | undefined;
}

export interface GoTypeSpec {
  importPath: string;
  typeName: string;
  raw: string;
}

export function getGoType(program: Program, prop: ModelProperty): GoTypeSpec | undefined {
  return program.stateMap(GoTypeKey).get(prop) as GoTypeSpec | undefined;
}

export interface RefineSpec {
  name: string;
  expression: string;
}

export function getRefines(program: Program, model: Model): RefineSpec[] {
  const value = program.stateMap(RefineKey).get(model) as RefineSpec[] | undefined;
  return value ? value.map((entry) => ({ ...entry })) : [];
}

// re-export to avoid unused import warning
export type { Scalar };
