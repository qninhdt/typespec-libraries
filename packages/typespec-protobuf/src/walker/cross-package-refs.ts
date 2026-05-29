import type { Enum, Model } from "@typespec/compiler";
import type { ProtoTypeRef } from "../types/scalars.js";
import type { PackageGraph } from "./package-graph.js";
import { planImportPath, type ImportPlannerOptions } from "./import-planner.js";

/**
 * Per-file naming context. The writers thread this through when rendering type
 * references so a message/enum ref resolves to:
 *
 * - the bare proto name (`FileInfo`) when the referenced type lives in the
 *   SAME package as the file being written, or
 * - the fully-qualified proto name (`openlet.events.v1.FileProcessed`) when it
 *   lives in a DIFFERENT package — and the import is recorded.
 *
 * Falls back to the ref's `qualifiedName` (TypeSpec-namespace form) when the
 * referenced type isn't in the package graph (e.g. single-file Phase 3 mode
 * with no graph, or a type outside any `@package` namespace).
 */
export interface NamingContext {
  /** Render the proto name to emit for a message / enum ref. */
  nameFor(type: Model | Enum, fallbackQualifiedName: string): string;
  /** Import paths accrued for cross-package references (deduped on read). */
  readonly imports: ReadonlySet<string>;
}

export interface BuildNamingContextOptions extends ImportPlannerOptions {
  graph: PackageGraph;
  /** Package name of the file currently being written. */
  currentPackage: string;
}

/**
 * Build a {@link NamingContext} for the given package. The returned context
 * mutates its internal import set as `nameFor` is called, so writers should
 * read `imports` AFTER rendering all fields.
 */
export function buildNamingContext(opts: BuildNamingContextOptions): NamingContext {
  const { graph, currentPackage } = opts;
  const imports = new Set<string>();

  return {
    imports,
    nameFor(type, fallbackQualifiedName) {
      const entry = graph.entryOf(type);
      if (!entry) {
        // Not in any emitted package — keep the TypeSpec-form name. The Phase 3
        // single-file path takes this branch when no graph entry exists.
        return fallbackQualifiedName;
      }
      if (entry.packageName === currentPackage) {
        return entry.protoName;
      }
      // Cross-package: emit fully-qualified proto name + record the import.
      imports.add(
        planImportPath(currentPackage, entry.packageName, {
          style: opts.style,
          outputPaths: opts.outputPaths,
        }),
      );
      return entry.qualifiedProtoName;
    },
  };
}

/**
 * Walk a `ProtoTypeRef` and surface the underlying Model / Enum (if any) so
 * callers can run it through a {@link NamingContext}. Returns undefined for
 * scalar / well-known / any refs.
 */
export function refNamedType(ref: ProtoTypeRef): Model | Enum | undefined {
  switch (ref.kind) {
    case "message":
      return ref.model;
    case "enum":
      return ref.enum;
    case "repeated":
      return refNamedType(ref.element);
    case "map":
      return refNamedType(ref.value);
    default:
      return undefined;
  }
}
