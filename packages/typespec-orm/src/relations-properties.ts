import type { Model, ModelProperty, Namespace, Program, Type } from "@typespec/compiler";
import { walkPropertiesInherited } from "@typespec/compiler";

import type { ModelIndexSpec } from "./decorators.js";
import { ModelUniquesKey } from "./lib.js";
import { resolveDbType } from "./scalar-resolution.js";
import { getColumnName, getTypeFullName, isKey, isUnique } from "./state-accessors.js";

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

interface PropertyReferenceMaps {
  byName: Map<string, ModelProperty>;
  byColumn: Map<string, ModelProperty>;
}

const propertyReferenceCache = new WeakMap<Program, WeakMap<Model, PropertyReferenceMaps>>();

function getPropertyReferenceMaps(program: Program, model: Model): PropertyReferenceMaps {
  let perProgram = propertyReferenceCache.get(program);
  if (!perProgram) {
    perProgram = new WeakMap<Model, PropertyReferenceMaps>();
    propertyReferenceCache.set(program, perProgram);
  }
  let cached = perProgram.get(model);
  if (cached) return cached;
  const byName = new Map<string, ModelProperty>();
  const byColumn = new Map<string, ModelProperty>();
  for (const prop of walkPropertiesInherited(model)) {
    if (!byName.has(prop.name)) byName.set(prop.name, prop);
    const columnName = getColumnName(program, prop);
    if (columnName && !byColumn.has(columnName)) byColumn.set(columnName, prop);
  }
  cached = { byName, byColumn };
  perProgram.set(model, cached);
  return cached;
}

export function resolvePropertyReference(
  program: Program,
  model: Model,
  reference: string,
): ModelProperty | undefined {
  const maps = getPropertyReferenceMaps(program, model);
  return maps.byName.get(reference) ?? maps.byColumn.get(reference);
}

export function resolvePropertyByName(model: Model, name: string): ModelProperty | undefined {
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
  if (isKey(program, prop) || isUnique(program, prop)) return true;
  const owner = prop.model;
  if (!owner) return false;
  const columnName = getColumnName(program, prop);
  const uniques =
    (program.stateMap(ModelUniquesKey).get(owner) as ModelIndexSpec[] | undefined) ?? [];
  for (const spec of uniques) {
    if (spec.columns.length !== 1) continue;
    const only = spec.columns[0];
    if (only === prop.name || only === columnName) return true;
  }
  return false;
}
