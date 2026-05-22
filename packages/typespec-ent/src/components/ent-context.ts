import type { GoPackageImport } from "./ent-imports.js";

/**
 * Mutable context shared across the ent schema builders for a single file.
 * Tracks plain and aliased Go imports plus marker flags that drive conditional
 * imports (entsql / entschema).
 */
export interface EntFileContext {
  imports: Set<string>;
  packageImports: GoPackageImport[];
  usesEntSql: boolean;
  usesEntSchema: boolean;
}

export function createEntFileContext(): EntFileContext {
  return {
    imports: new Set<string>(["entgo.io/ent"]),
    packageImports: [],
    usesEntSql: false,
    usesEntSchema: false,
  };
}

/**
 * Joins a builder expression with its chained method calls onto separate
 * indented lines. When there are no chains, returns the bare builder.
 */
export function buildChain(builder: string, chains: string[]): string {
  if (chains.length === 0) {
    return builder;
  }
  return [builder, ...chains].join(".\n");
}
