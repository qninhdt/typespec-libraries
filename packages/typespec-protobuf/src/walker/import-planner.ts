import { packageNameToFilePath } from "./package-graph.js";

/**
 * How an `import "...";` path is rendered for a cross-package reference.
 *
 * - `package-path` (default): `openlet/events/v1.proto`. Derived from the
 *   package name; works across per-service buf modules because every module
 *   shares the same `openlet/...` layout.
 * - `relative`: path relative to the importing file's directory. Rarely
 *   correct under buf module roots — provided for non-buf consumers.
 * - `flat`: just the basename (`v1.proto`). For single-directory proto trees.
 */
export type ImportPathStyle = "package-path" | "relative" | "flat";

export interface ImportPlannerOptions {
  style?: ImportPathStyle;
  /** Optional package-name → file-path overrides (tspconfig `output-paths`). */
  outputPaths?: Record<string, string>;
}

/**
 * Compute the `import` path string the proto compiler expects when a file in
 * `importerPackage` references a type owned by `importedPackage`.
 */
export function planImportPath(
  importerPackage: string,
  importedPackage: string,
  opts: ImportPlannerOptions = {},
): string {
  const style = opts.style ?? "package-path";
  const importedFile =
    opts.outputPaths?.[importedPackage] ?? packageNameToFilePath(importedPackage);

  switch (style) {
    case "package-path":
      return importedFile;
    case "flat":
      return basename(importedFile);
    case "relative":
      return relativeImport(
        opts.outputPaths?.[importerPackage] ?? packageNameToFilePath(importerPackage),
        importedFile,
      );
  }
}

function basename(p: string): string {
  const idx = p.lastIndexOf("/");
  return idx >= 0 ? p.slice(idx + 1) : p;
}

/**
 * Build a `./`-relative import path from one file to another. Both inputs are
 * module-root-relative slash paths.
 */
function relativeImport(fromFile: string, toFile: string): string {
  const fromDir = fromFile.split("/").slice(0, -1);
  const toParts = toFile.split("/");
  let i = 0;
  while (i < fromDir.length && i < toParts.length - 1 && fromDir[i] === toParts[i]) {
    i++;
  }
  const up = fromDir.length - i;
  const segments: string[] = [];
  for (let u = 0; u < up; u++) segments.push("..");
  for (let j = i; j < toParts.length; j++) segments.push(toParts[j]!);
  const joined = segments.join("/");
  return joined.startsWith(".") ? joined : `./${joined}`;
}
