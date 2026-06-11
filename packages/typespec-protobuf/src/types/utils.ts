import type { Enum, Model, Namespace, Program, Scalar } from "@typespec/compiler";

/**
 * Walk the scalar inheritance chain (most-specific first). Mirrors
 * `getScalarChain` in `@qninhdt/typespec-orm` so the resolver behavior is
 * predictable for authors familiar with the ORM library.
 *
 * Example: `uuid extends string` → `["uuid", "string"]`.
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

/**
 * Build a TypeSpec-namespace-qualified name for a model or enum. Walks up the
 * namespace chain stopping at the global namespace. Returns just the type's
 * name when the type is at global scope.
 *
 * Phase 4 will rewrite these into proto-package-qualified names once the
 * package map is available; for Phase 2 we surface the TypeSpec-side
 * qualification only.
 */
export function getQualifiedTypeName(program: Program, type: Model | Enum): string {
  if (!type.name) return "";
  const segments: string[] = [];
  const global = program.getGlobalNamespaceType();
  let current: Namespace | undefined = type.namespace;
  while (current && current !== global) {
    if (current.name !== "") segments.push(current.name);
    current = current.namespace;
  }
  segments.reverse();
  return segments.length > 0 ? `${segments.join(".")}.${type.name}` : type.name;
}
