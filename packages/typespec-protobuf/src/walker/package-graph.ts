import type { Enum, Model, Program } from "@typespec/compiler";
import { getProtoMessageOverrideName } from "../state-accessors.js";
import type { PackageBucket } from "./collect-packages.js";

/**
 * Precomputed proto-naming + file-location facts for a single message or enum.
 * Built once per emit pass so the writers don't re-derive override names or
 * file paths on every type reference.
 */
export interface PackageGraphEntry {
  /** Owning proto package name (e.g. "openlet.events.v1"). */
  packageName: string;
  /** Message / enum name without package prefix (override-aware). */
  protoName: string;
  /** Fully-qualified proto name (e.g. "openlet.events.v1.FileProcessed"). */
  qualifiedProtoName: string;
  /** Output `.proto` file path for the owning package (package-path form). */
  filePath: string;
}

/**
 * Index of every emitted message / enum plus per-package file paths. Lets the
 * writers decide, for any `ProtoTypeRef`, whether a reference is same-package
 * (emit the bare name) or cross-package (emit the qualified name + an import).
 */
export interface PackageGraph {
  buckets: PackageBucket[];
  entryOf(type: Model | Enum): PackageGraphEntry | undefined;
  filePathOf(packageName: string): string | undefined;
}

export interface BuildPackageGraphOptions {
  /** Optional package-name → file-path overrides from tspconfig `output-paths`. */
  outputPaths?: Record<string, string>;
}

/**
 * Build the package graph from the collected buckets. Walks every message and
 * enum in each bucket and records its proto name, qualified name, and owning
 * file path.
 */
export function buildPackageGraph(
  program: Program,
  buckets: PackageBucket[],
  opts: BuildPackageGraphOptions = {},
): PackageGraph {
  const entries = new Map<Model | Enum, PackageGraphEntry>();
  const filePaths = new Map<string, string>();

  for (const bucket of buckets) {
    const pkgName = bucket.spec.name;
    const filePath = opts.outputPaths?.[pkgName] ?? packageNameToFilePath(pkgName);
    filePaths.set(pkgName, filePath);

    for (const model of [...bucket.messages, ...bucket.entities]) {
      const protoName = getProtoMessageOverrideName(program, model) ?? model.name;
      entries.set(model, {
        packageName: pkgName,
        protoName,
        qualifiedProtoName: `${pkgName}.${protoName}`,
        filePath,
      });
    }
    for (const e of bucket.enums) {
      entries.set(e, {
        packageName: pkgName,
        protoName: e.name,
        qualifiedProtoName: `${pkgName}.${e.name}`,
        filePath,
      });
    }
  }

  return {
    buckets,
    entryOf: (type) => entries.get(type),
    filePathOf: (name) => filePaths.get(name),
  };
}

/**
 * Convert a dotted proto package name to a slash-separated `.proto` file path.
 * `openlet.events.v1` → `openlet/events/v1.proto`.
 */
export function packageNameToFilePath(packageName: string): string {
  return `${packageName.replace(/\./g, "/")}.proto`;
}
