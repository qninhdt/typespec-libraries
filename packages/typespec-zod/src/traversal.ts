/**
 * Shared type traversal helper.
 *
 * Walks a TypeSpec type and recursively visits all referenced types
 * (model properties, base models, indexer key/value, union variants,
 * tuple values, base scalars). Each type is visited at most once per call.
 *
 * Used by `ZodModelFile` (to collect referenced declarations) and
 * `ZodScalarsFile` (to collect referenced scalars). Centralizing this
 * traversal avoids walking the type graph twice.
 */

import { walkPropertiesInherited, type Type } from "@typespec/compiler";

export function walkReferencedTypes(root: Type, visit: (type: Type) => void): void {
  const seen = new Set<Type>();

  function walk(current: Type): void {
    if (seen.has(current)) return;
    seen.add(current);

    visit(current);

    switch (current.kind) {
      case "Model":
        if (current.baseModel) walk(current.baseModel);
        if (current.indexer) {
          walk(current.indexer.key);
          walk(current.indexer.value);
        }
        for (const prop of walkPropertiesInherited(current)) {
          walk(prop.type);
        }
        return;
      case "Union":
        for (const variant of current.variants.values()) {
          walk(variant.kind === "UnionVariant" ? variant.type : variant);
        }
        return;
      case "UnionVariant":
        walk(current.type);
        return;
      case "Tuple":
        for (const value of current.values) {
          walk(value);
        }
        return;
      case "Scalar":
        if (current.baseScalar) walk(current.baseScalar);
        return;
    }
  }

  walk(root);
}
