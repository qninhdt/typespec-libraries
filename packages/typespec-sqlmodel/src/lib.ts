import { createTypeSpecLibrary, paramMessage, type JSONSchemaType } from "@typespec/compiler";

export interface SqlModelEmitterOptions {
  /** Output directory override handled by TypeSpec */
  "output-dir"?: string;
  /** Whether to generate standalone Python package (default: false) */
  standalone?: boolean;
  /** Python distribution name for standalone package */
  "library-name"?: string;
  /** Distribution version written to the standalone pyproject.toml (default: "0.0.0") */
  version?: string;
  /** Optional description written to the standalone pyproject.toml */
  description?: string;
  /**
   * License text written to a `LICENSE` file alongside the standalone package.
   * Defaults to a generic proprietary placeholder so the artifact at least
   * carries an explicit notice. Set to a SPDX-style block or full license
   * text when distributing.
   */
  license?: string;
  /** Namespace selectors to include */
  include?: string[];
  /** Namespace selectors to exclude */
  exclude?: string[];
  /** When true, transitively pull required dependencies into the selection */
  "auto-include-dependencies"?: boolean;
  /** Explicit persistence strategy for collection fields */
  "collection-strategy"?: "jsonb" | "postgres";
  /** When true, write `atlas.hcl` alongside the generated package (default: false) */
  "emit-atlas"?: boolean;
}

const EmitterOptionsSchema: JSONSchemaType<SqlModelEmitterOptions> = {
  type: "object",
  additionalProperties: false,
  properties: {
    "output-dir": { type: "string", nullable: true },
    standalone: { type: "boolean", nullable: true },
    "library-name": { type: "string", nullable: true },
    version: { type: "string", nullable: true },
    description: { type: "string", nullable: true },
    license: { type: "string", nullable: true },
    include: { type: "array", items: { type: "string" }, nullable: true },
    exclude: { type: "array", items: { type: "string" }, nullable: true },
    "auto-include-dependencies": { type: "boolean", nullable: true },
    "collection-strategy": { type: "string", enum: ["jsonb", "postgres"], nullable: true },
    "emit-atlas": { type: "boolean", nullable: true },
  },
  required: [],
};

export const $lib = createTypeSpecLibrary({
  name: "@qninhdt/typespec-sqlmodel",
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
        default: paramMessage`Type "${"typeName"}" on property "${"propName"}" could not be mapped to a Python type.`,
      },
    },
    "missing-back-reference": {
      severity: "error",
      messages: {
        default: paramMessage`One-to-many "${"propName"}" on "${"modelName"}" has no inverse many-to-one on "${"targetModel"}". SQLAlchemy may not resolve the foreign key automatically.`,
      },
    },
    "string-without-max-length": {
      severity: "error",
      messages: {
        default: paramMessage`Property "${"propName"}" is a bare string. Add @maxLength(N) or use the "text" scalar for unlimited text.`,
      },
    },
    "emit-write-failed": {
      severity: "error",
      messages: {
        default: paramMessage`Failed to write output file "${"fileName"}": ${"error"}.`,
      },
    },
    "no-tables-found": {
      severity: "warning",
      messages: {
        default: "No models decorated with @table or @data were found. Nothing to emit.",
      },
    },
    "cross-namespace-many-to-many-unsupported": {
      severity: "error",
      messages: {
        default: paramMessage`Many-to-many relationship between "${"leftModel"}" (namespace "${"leftNamespace"}") and "${"rightModel"}" (namespace "${"rightNamespace"}") spans top-level packages. Move both models under the same top-level namespace, or split the relationship through a third join table.`,
      },
    },
    "init-export-collision": {
      severity: "error",
      messages: {
        default: paramMessage`Generated __init__.py for package "${"packageName"}" exports "${"name"}" more than once. A child package, model, or reserved attribute is colliding.`,
      },
    },
    "filtered-association-table-missing": {
      severity: "error",
      messages: {
        default: paramMessage`Many-to-many association table "${"tableName"}" was placed under top-level "${"topLevel"}" which is not in the selected output set. The generated import "from ${"topLevel"}.__associations__ import ${"symbol"}" will fail to resolve at runtime. Adjust 'include'/'exclude' so the chosen top-level package is emitted, or remove the association.`,
      },
    },
  },
  emitter: {
    options: EmitterOptionsSchema,
  },
} as const);

export const { reportDiagnostic } = $lib;
