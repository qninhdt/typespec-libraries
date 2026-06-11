function parseAliasedImport(
  value: string,
): { moduleName: string; name: string; alias: string } | undefined {
  const pattern = /^(.+)\.(\w+)\s+as\s+(\w+)$/;
  const match = pattern.exec(value);
  if (!match) {
    return undefined;
  }

  const [, moduleName, name, alias] = match;
  return { moduleName, name, alias };
}

function addGroupedImport(
  groups: Map<string, Set<string>>,
  moduleName: string,
  name: string,
): void {
  if (!groups.has(moduleName)) {
    groups.set(moduleName, new Set());
  }
  groups.get(moduleName)!.add(name);
}

export function groupImports(imports: Set<string>): Map<string, Set<string>> {
  const groups = new Map<string, Set<string>>();

  for (const imp of imports) {
    const aliasedImport = parseAliasedImport(imp);
    if (aliasedImport) {
      addGroupedImport(
        groups,
        aliasedImport.moduleName,
        `${aliasedImport.name} as ${aliasedImport.alias}`,
      );
      continue;
    }

    const lastDot = imp.lastIndexOf(".");
    if (lastDot === -1) {
      groups.set(imp, new Set([imp]));
      continue;
    }

    const mod = imp.substring(0, lastDot);
    const name = imp.substring(lastDot + 1);
    addGroupedImport(groups, mod, name);
  }

  return groups;
}

export function buildPythonImportBlock(
  stdImports: Set<string>,
  saImports: Set<string>,
  sqlmodelOrPydanticImports: Set<string>,
  importSource: "sqlmodel" | "pydantic",
): string {
  let code = "";

  const stdGroups = groupImports(stdImports);
  for (const [mod, names] of stdGroups) {
    code += `from ${mod} import ${[...names].sort((left, right) => left.localeCompare(right)).join(", ")}\n`;
  }
  if (stdGroups.size > 0) code += "\n";

  const saGroups = groupImports(saImports);
  for (const [mod, names] of saGroups) {
    code += `from ${mod} import ${[...names].sort((left, right) => left.localeCompare(right)).join(", ")}\n`;
  }

  const importList = [...sqlmodelOrPydanticImports].sort((left, right) =>
    left.localeCompare(right),
  );
  if (importList.length > 0) {
    code += `from ${importSource} import ${importList.join(", ")}\n`;
  }

  return code;
}

export function toPythonRelativeImport(
  fromSegments: readonly string[],
  toSegments: readonly string[],
  moduleName: string,
): string {
  let common = 0;
  while (
    common < fromSegments.length &&
    common < toSegments.length &&
    fromSegments[common] === toSegments[common]
  ) {
    common++;
  }

  const up = fromSegments.length - common;
  const down = toSegments.slice(common);
  return `${".".repeat(up + 1)}${[...down, moduleName].join(".")}`;
}
