/**
 * Scalar -> DB type resolution and inheritance-chain helpers.
 *
 * The ORM exposes both TypeSpec-built-in scalars (`int32`, `string`, ...) and
 * custom semantic scalars (`email`, `uuid`, ...). Property decorators may also
 * be authored on a scalar definition itself, so emitters need to walk the
 * inheritance chain when looking up validators and DB types.
 */

import type { ModelProperty, Program, Scalar, Type } from "@typespec/compiler";

/**
 * Walk the scalar inheritance chain and return an ordered list of scalar names.
 * e.g. for `uuid extends string` -> ["uuid", "string"]
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

/** Standard TypeSpec scalar -> canonical DB type mapping */
export const STANDARD_SCALAR_MAP: Record<string, string> = {
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
  // PG-canonical types: surface scalar name so emitters can branch.
  ipv4: "ipv4",
  ipv6: "ipv6",
  cidr: "cidr",
  inet: "inet",
  citext: "citext",
  tsvector: "tsvector",
  tsquery: "tsquery",
  interval: "interval",
};

/** DB-specific scalars that need custom column type handling */
export const DB_SCALARS = new Set(["uuid", "text", "jsonb", "serial", "bigserial"]);

/**
 * Resolve a TypeSpec type to a canonical database type name.
 * Returns undefined for non-scalar types.
 * Unwraps lookup types (ModelProperty references) to find the underlying scalar.
 *
 * Semantic scalars (email, ipv4, etc.) resolve to their base DB type (string, float64).
 * Only DB-specific scalars (uuid, text, jsonb, serial, bigserial) return their custom names.
 */
export function resolveDbType(type: Type): string | undefined {
  // Unwrap lookup types: User.email -> email.type (the actual Scalar)
  if (type.kind === "ModelProperty") {
    return resolveDbType(type.type);
  }
  if (type.kind !== "Scalar") return undefined;
  const chain = getScalarChain(type);

  for (const name of chain) {
    if (DB_SCALARS.has(name)) return name;
  }

  for (const name of chain) {
    if (name in STANDARD_SCALAR_MAP) return STANDARD_SCALAR_MAP[name];
  }

  return undefined;
}

/** ORM-defined semantic scalars with emitter-specific native handling. */
const ORM_SEMANTIC_SCALARS = new Set([
  // Semantic string scalars (url is TypeSpec built-in, the rest are ours)
  "email",
  "url",
  "ipv4",
  "ipv6",
  "ip",
  "cidr",
  "mac",
  "base64",
  "hostname",
  // ID/token scalars
  "cuid",
  "cuid2",
  "ulid",
  "nanoid",
  "jwt",
  "emoji",
  // Semantic numeric scalars
  "latitude",
  "longitude",
]);

/**
 * Walk the scalar chain and return the first ORM semantic scalar name.
 * For other custom scalars (for example `scalar AdultAge extends int32`),
 * returns undefined.
 */
export function getOrmScalarName(type: Type): string | undefined {
  if (type.kind === "ModelProperty") return getOrmScalarName(type.type);
  if (type.kind !== "Scalar") return undefined;
  const chain = getScalarChain(type);
  for (const name of chain) {
    if (ORM_SEMANTIC_SCALARS.has(name)) return name;
  }
  return undefined;
}

/**
 * Returns the scalar name for any non-built-in, non-DB scalar.
 * This includes ORM semantic scalars and user-defined scalars.
 */
export function getCustomScalarName(type: Type): string | undefined {
  if (type.kind === "ModelProperty") return getCustomScalarName(type.type);
  if (type.kind !== "Scalar") return undefined;

  const dbType = resolveDbType(type);
  if (dbType && DB_SCALARS.has(dbType)) return undefined;

  const chain = getScalarChain(type);
  const baseName = chain.at(-1);
  if (baseName && STANDARD_SCALAR_MAP[baseName] !== undefined) {
    return type.name;
  }

  return undefined;
}

/**
 * If a property's type is itself a ModelProperty (lookup type syntax, e.g.
 * `inviteeEmail: User.email`), return that source ModelProperty.
 * Emitters use this to inherit validators / decorators from the referenced
 * property when the type is a lookup reference.
 */
export function lookupSourceProp(prop: ModelProperty): ModelProperty | undefined {
  return prop.type.kind === "ModelProperty" ? prop.type : undefined;
}

/**
 * Walk the scalar chain of a property's type and return the first non-undefined
 * result from the getter. This allows decorators on custom scalar definitions
 * (e.g., `@minValue(18) scalar AdultAge extends int32`) to be inherited by
 * properties using that scalar type.
 *
 * Walks the chain for any scalar so custom scalar decorators can be inherited
 * uniformly. Emitters that have native handling for a scalar decide locally
 * whether to use these inherited constraints.
 */
export function scalarChainFallback<T>(
  getter: (program: Program, target: Type) => T | undefined,
  program: Program,
  prop: ModelProperty,
): T | undefined {
  let current: Scalar | undefined = prop.type.kind === "Scalar" ? prop.type : undefined;
  while (current) {
    const result = getter(program, current);
    if (result !== undefined) return result;
    current = current.baseScalar;
  }
  return undefined;
}

/**
 * Create a getter that reads a TypeSpec intrinsic value from the property,
 * falling back to:
 * 1. The lookup-source property (for `User.email` syntax)
 * 2. The scalar chain (for `@minValue(18) scalar AdultAge extends int32`)
 *
 * This enables decorators defined on custom scalar types to be inherited
 * by any property using that scalar.
 */
export function withLookupFallback<T>(
  getter: (program: Program, target: Type) => T | undefined,
): (program: Program, prop: ModelProperty) => T | undefined {
  return (program, prop) => {
    const direct = getter(program, prop);
    if (direct !== undefined) return direct;
    const src = lookupSourceProp(prop);
    if (src) {
      const lookupResult = getter(program, src);
      if (lookupResult !== undefined) return lookupResult;
    }
    return scalarChainFallback(getter, program, prop);
  };
}
