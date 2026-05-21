export interface GoPackageImport {
  alias: string;
  path: string;
}

export function buildImportBlock(
  imports: Set<string>,
  packageImports: GoPackageImport[] = [],
): string {
  const aliased: GoPackageImport[] = [...packageImports];
  const plain: string[] = [];

  for (const imp of imports) {
    if (imp.includes(" ")) {
      const [alias, path] = imp.split(" ");
      aliased.push({ alias, path: path.replaceAll('"', "") });
    } else {
      plain.push(imp);
    }
  }

  const sorted = plain.sort((left, right) => left.localeCompare(right));
  if (sorted.length === 0 && aliased.length === 0) return "";

  const stdImports = sorted.filter((i) => !i.includes("."));
  const extImports = sorted.filter((i) => i.includes("."));
  const sortedAliased = aliased.sort((a, b) => a.alias.localeCompare(b.alias));

  const parts: string[] = ["import (", ...stdImports.map((imp) => `\t"${imp}"`)];
  if (stdImports.length > 0 && (extImports.length > 0 || sortedAliased.length > 0)) {
    parts.push("");
  }
  parts.push(...extImports.map((imp) => `\t"${imp}"`));
  if (extImports.length > 0 && sortedAliased.length > 0) {
    parts.push("");
  }
  parts.push(...sortedAliased.map((imp) => `\t${imp.alias} "${imp.path}"`), ")");
  return parts.join("\n") + "\n";
}
