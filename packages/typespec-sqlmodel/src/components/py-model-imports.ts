import type { Model } from "@typespec/compiler";
import { camelToSnake, type NormalizedOrmModel } from "@qninhdt/typespec-orm";
import { toPythonRelativeImport } from "./PyConstants.js";

export function dedupeImportNames(names: readonly string[]): string[] {
  return [...new Set(names)].sort((left, right) => left.localeCompare(right));
}

export function buildRuntimeImportBlock(runtimeImports?: Map<string, Set<string>>): string {
  if (!runtimeImports || runtimeImports.size === 0) {
    return "";
  }

  let code = "\n";
  for (const [moduleName, names] of [...runtimeImports.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    code += `from ${moduleName} import ${[...names].sort((a, b) => a.localeCompare(b)).join(", ")}\n`;
  }
  return code;
}

export function buildSourceModelImportBlock(
  sourceModels: Model[],
  modelLookup: Map<Model, NormalizedOrmModel>,
  namespacePath: string[],
): string {
  if (sourceModels.length === 0) {
    return "";
  }

  let code = "";
  for (const sourceModel of sourceModels) {
    const sourceInfo = modelLookup.get(sourceModel);
    if (!sourceInfo) continue;
    code += `from ${toPythonRelativeImport(namespacePath, sourceInfo.namespacePath, camelToSnake(sourceModel.name))} import ${sourceModel.name}\n`;
  }
  return code ? `${code}\n` : "";
}

export function buildTypeCheckingBlock(
  relationTargetModels: Set<Model>,
  modelLookup: Map<Model, NormalizedOrmModel>,
  namespacePath: string[],
): string {
  if (relationTargetModels.size === 0) {
    return "";
  }

  let code = "\nif TYPE_CHECKING:\n";
  for (const targetModel of [...relationTargetModels].sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const targetInfo = modelLookup.get(targetModel);
    if (!targetInfo) continue;
    code += `    from ${toPythonRelativeImport(namespacePath, targetInfo.namespacePath, camelToSnake(targetModel.name))} import ${targetModel.name}\n`;
  }
  return code;
}
