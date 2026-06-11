import type {
  Enum,
  Model,
  ModelProperty,
  Namespace,
  Program,
  Scalar,
  Type,
} from "@typespec/compiler";
import { getDoc as tsGetDoc, walkPropertiesInherited } from "@typespec/compiler";
import {
  DB_SCALARS,
  getOrmScalarName,
  lookupSourceProp,
  resolveDbType,
} from "./scalar-resolution.js";

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

export function isArrayType(type: Type): boolean {
  return type.kind === "Model" && type.indexer !== undefined;
}

export function getArrayElementType(type: Type): Type | undefined {
  if (type.kind === "Model" && type.indexer) {
    return type.indexer.value;
  }
  return undefined;
}

export function getModelOwnProperties(model: Model): ModelProperty[] {
  // `sourceProperty` is an internal compiler field that marks props inherited via
  // `...Mixin` spread. There is no public API for "own props only", so we depend
  // on it directly; if the compiler renames it this returns inherited props too.
  return [...model.properties.values()].filter(
    (prop) => (prop as { sourceProperty?: ModelProperty }).sourceProperty === undefined,
  );
}

/**
 * Returns the @doc() string for a model or property, if set.
 * Falls back to the source property for lookup types.
 */
export function getDoc(program: Program, target: Model | ModelProperty): string | undefined {
  let raw = tsGetDoc(program, target);
  if (!raw && target.kind === "ModelProperty") {
    const source = lookupSourceProp(target);
    if (source) raw = tsGetDoc(program, source);
  }
  if (!raw) return undefined;
  return raw.replaceAll(/\r?\n[\t *]*/g, " ").trim();
}

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
