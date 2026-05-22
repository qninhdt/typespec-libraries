import { createTypeSpecLibrary, paramMessage, type JSONSchemaType } from "@typespec/compiler";

export interface EntEmitterOptions {
  /** Output directory override handled by TypeSpec */
  "output-dir"?: string;
  /** Whether to generate standalone Go module (default: false) */
  standalone?: boolean;
  /** Go module / library import path for generated packages */
  "library-name"?: string;
  /** Namespace selectors to include */
  include?: string[];
  /** Namespace selectors to exclude */
  exclude?: string[];
  /** When true, transitively pull required dependencies into the selection */
  "auto-include-dependencies"?: boolean;
  /** Explicit persistence strategy for collection fields */
  "collection-strategy"?: "jsonb" | "postgres";
  /** Go toolchain version for generated `go.mod` (default: "1.24") */
  "go-version"?: string;
  /** Library/module version surfaced in the generated standalone README */
  version?: string;
  /**
   * When true, surface ON UPDATE actions as a `Comment("on_update: <action>")`
   * Ent annotation instead of dropping them with a warning. Downstream Atlas
   * tooling can pick the marker up via custom rules. Default: `false`.
   */
  "on-update-emit-raw-sql"?: boolean;
}

const EmitterOptionsSchema: JSONSchemaType<EntEmitterOptions> = {
  type: "object",
  additionalProperties: false,
  properties: {
    "output-dir": { type: "string", nullable: true },
    standalone: { type: "boolean", nullable: true },
    "library-name": { type: "string", nullable: true },
    include: { type: "array", items: { type: "string" }, nullable: true },
    exclude: { type: "array", items: { type: "string" }, nullable: true },
    "auto-include-dependencies": { type: "boolean", nullable: true },
    "collection-strategy": { type: "string", nullable: true },
    "go-version": { type: "string", nullable: true },
    version: { type: "string", nullable: true },
    "on-update-emit-raw-sql": { type: "boolean", nullable: true },
  },
  required: [],
};

export const $lib = createTypeSpecLibrary({
  name: "@qninhdt/typespec-ent",
  diagnostics: {
    "standalone-requires-library-name": {
      severity: "error",
      messages: {
        default: "standalone mode requires 'library-name' option",
      },
    },
    "unsupported-type": {
      severity: "error",
      messages: {
        default: paramMessage`Type "${"typeName"}" on property "${"propName"}" could not be mapped to a Go type.`,
      },
    },
    "missing-back-reference": {
      severity: "error",
      messages: {
        default: paramMessage`Self many-to-many relation "${"propName"}" on "${"modelName"}" requires an explicit @backPopulates so Ent can pick an owning side deterministically.`,
      },
    },
    "on-update-not-supported-by-ent": {
      severity: "warning",
      messages: {
        default: paramMessage`@onUpdate(${"action"}) on relation '${"relationName"}' is dropped — Ent does not emit ON UPDATE clauses.`,
      },
    },
    "cross-package-edge": {
      severity: "error",
      messages: {
        default: paramMessage`Edge "${"propName"}" on "${"sourceModel"}" targets "${"targetModel"}" in a different Go package ("${"sourcePackage"}" vs "${"targetPackage"}"). Ent emits all schemas into a single package; cross-package edges are not supported.`,
      },
    },
    "referenced-column-fk-not-supported-by-ent": {
      severity: "error",
      messages: {
        default: paramMessage`@foreignKey on relation "${"propName"}" references non-key column "${"targetColumn"}" of "${"targetModel"}". Ent only supports edges that point to the target's @key column.`,
      },
    },
    "emit-write-failed": {
      severity: "error",
      messages: {
        default: paramMessage`Failed to write output to directory "${"outputDir"}": ${"error"}.`,
      },
    },
    "no-tables-found": {
      severity: "warning",
      messages: {
        default: "No models decorated with @table or @data were found. Nothing to emit.",
      },
    },
  },
  emitter: {
    options: EmitterOptionsSchema,
  },
} as const);

export const { reportDiagnostic } = $lib;
