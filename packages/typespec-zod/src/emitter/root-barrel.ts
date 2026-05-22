/**
 * Generates the contents of `src/index.ts` (the root barrel).
 *
 * Two pieces of logic live here:
 *
 * 1. Re-export `_scalars.ts` when at least one custom scalar was emitted,
 *    so consumers importing from the package root see scalar schemas.
 *
 * 2. Disambiguate model name collisions across namespaces. Two models
 *    with the same simple name in different namespaces would silently
 *    clash if we used `export *` for both — later modules' bindings
 *    overwrite earlier ones at run time. Detect collisions up front and
 *    emit namespace-prefixed re-exports for those, while keeping the
 *    plain `export *` form for unique names.
 */
import type { NormalizedOrmModel } from "@qninhdt/typespec-orm";

export function generateRootBarrel(
  models: readonly NormalizedOrmModel[],
  hasScalarsFile: boolean,
): string {
  const lines: string[] = [];

  if (hasScalarsFile) {
    lines.push(`export * from "./_scalars.js";`);
  }

  const counts = new Map<string, number>();
  for (const model of models) {
    counts.set(model.model.name, (counts.get(model.model.name) ?? 0) + 1);
  }

  for (const model of models) {
    const importPath = `./${model.namespaceDir}/${model.model.name}.js`;
    const isCollision = (counts.get(model.model.name) ?? 0) > 1;
    if (isCollision) {
      // Qualify with namespace path so each colliding name gets a unique
      // PascalCase prefix. `export * as X` keeps tree-shaking intact and
      // avoids forcing us to know each model's exported member names.
      const alias = buildNamespaceAlias(model);
      lines.push(`export * as ${alias} from "${importPath}";`);
    } else {
      lines.push(`export * from "${importPath}";`);
    }
  }

  return lines.join("\n");
}

function buildNamespaceAlias(model: NormalizedOrmModel): string {
  const segments = model.namespacePath.length > 0 ? model.namespacePath : [model.namespace];
  const prefix = segments
    .map(toPascalCase)
    .filter((part) => part.length > 0)
    .join("");
  return `${prefix}${toPascalCase(model.model.name)}`;
}

function toPascalCase(value: string): string {
  if (!value) return "";
  return (
    value.charAt(0).toUpperCase() +
    value.slice(1).replaceAll(/[-_./](.)/g, (_, c: string) => c.toUpperCase())
  );
}
