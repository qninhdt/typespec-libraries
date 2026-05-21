export interface GoPackageImport {
  alias: string;
  path: string;
}

export function buildImportBlock(
  imports: Set<string>,
  packageImports: GoPackageImport[] = [],
): string {
  const sorted = [...imports].sort((left, right) => left.localeCompare(right));
  if (sorted.length === 0 && packageImports.length === 0) return "";
  const stdImports = sorted.filter((i) => !i.includes("."));
  const extImports = sorted.filter((i) => i.includes("."));

  const sortedPackageImports = [...packageImports].sort((a, b) => a.alias.localeCompare(b.alias));
  const parts: string[] = ["import (", ...stdImports.map((imp) => `\t"${imp}"`)];
  if (stdImports.length > 0 && (extImports.length > 0 || sortedPackageImports.length > 0)) {
    parts.push("");
  }
  parts.push(...extImports.map((imp) => `\t"${imp}"`));
  if (extImports.length > 0 && sortedPackageImports.length > 0) {
    parts.push("");
  }
  parts.push(...sortedPackageImports.map((imp) => `\t${imp.alias} "${imp.path}"`), ")");
  return parts.join("\n") + "\n";
}
