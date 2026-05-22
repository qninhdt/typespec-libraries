import { createTypeSpecLibrary, paramMessage, type JSONSchemaType } from "@typespec/compiler";

export interface SqlModelEmitterOptions {
  /** Output directory override handled by TypeSpec */
  "output-dir"?: string;
  /** Whether to generate standalone Python package (default: false) */
  standalone?: boolean;
  /** Python distribution name for standalone package */
  "library-name"?: string;
  /** Namespace selectors to include */
  include?: string[];
  /** Namespace selectors to exclude */
  exclude?: string[];
  /** Explicit persistence strategy for collection fields */
  "collection-strategy"?: "jsonb" | "postgres";
}

const EmitterOptionsSchema: JSONSchemaType<SqlModelEmitterOptions> = {
  type: "object",
  additionalProperties: false,
  properties: {
    "output-dir": { type: "string", nullable: true },
    standalone: { type: "boolean", nullable: true },
    "library-name": { type: "string", nullable: true },
    include: { type: "array", items: { type: "string" }, nullable: true },
    exclude: { type: "array", items: { type: "string" }, nullable: true },
    "collection-strategy": { type: "string", enum: ["jsonb", "postgres"], nullable: true },
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
      severity: "warning",
      messages: {
        default: paramMessage`One-to-many "${"propName"}" on "${"modelName"}" has no inverse many-to-one on "${"targetModel"}". SQLAlchemy may not resolve the foreign key automatically.`,
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
    "init-export-collision": {
      severity: "error",
      messages: {
        default: paramMessage`Generated __init__.py for package "${"packageName"}" exports "${"name"}" more than once. A child package, model, or reserved attribute is colliding.`,
      },
    },
  },
  emitter: {
    options: EmitterOptionsSchema,
  },
} as const);

export const { reportDiagnostic } = $lib;
