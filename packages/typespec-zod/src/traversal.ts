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

import { Model, walkPropertiesInherited, type Type } from "@typespec/compiler";

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

/**
 * Detect models that participate in a reference cycle.
 *
 * Self-referential models (`Folder { parent: Folder }`) and mutually-recursive
 * pairs (`User { workspace: Workspace }` / `Workspace { owner: User }`)
 * produce schemas that recurse forever or fail to construct unless the
 * reference site is wrapped in `z.lazy(() => OtherSchema)`.
 *
 * Returns true if `model` participates in any reference cycle (self-reference
 * or mutual recursion). Result is memoized on the model since cycles are a
 * structural property that doesn't change during emit.
 */
const cycleCache = new WeakMap<Model, boolean>();
export function isModelInCycle(model: Model): boolean {
  const cached = cycleCache.get(model);
  if (cached !== undefined) return cached;

  // BFS from `model`'s children: if we can reach `model` again, it's part
  // of a cycle. Walk Model→Model edges only; descend through Unions /
  // UnionVariants / Tuples to find underlying models.
  const visited = new Set<Model>();
  const queue: Model[] = [];

  function pushModelsFrom(t: Type): void {
    switch (t.kind) {
      case "Model":
        if (!visited.has(t)) {
          visited.add(t);
          queue.push(t);
        }
        return;
      case "Union":
        for (const v of t.variants.values()) {
          pushModelsFrom(v.kind === "UnionVariant" ? v.type : v);
        }
        return;
      case "UnionVariant":
        pushModelsFrom(t.type);
        return;
      case "Tuple":
        for (const v of t.values) pushModelsFrom(v);
        return;
    }
  }

  // Seed with `model`'s direct edges. Self-references show up as `model`
  // itself appearing in `visited` after seeding.
  if (model.baseModel) pushModelsFrom(model.baseModel);
  if (model.indexer) {
    pushModelsFrom(model.indexer.key);
    pushModelsFrom(model.indexer.value);
  }
  for (const prop of walkPropertiesInherited(model)) {
    pushModelsFrom(prop.type);
  }

  if (visited.has(model)) {
    cycleCache.set(model, true);
    return true;
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.baseModel) pushModelsFrom(current.baseModel);
    if (current.indexer) {
      pushModelsFrom(current.indexer.key);
      pushModelsFrom(current.indexer.value);
    }
    for (const prop of walkPropertiesInherited(current)) {
      pushModelsFrom(prop.type);
    }
    if (visited.has(model)) {
      cycleCache.set(model, true);
      return true;
    }
  }

  cycleCache.set(model, false);
  return false;
}
