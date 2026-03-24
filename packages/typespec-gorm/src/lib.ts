import { createTypeSpecLibrary, paramMessage, type JSONSchemaType } from "@typespec/compiler";

export interface GormEmitterOptions {
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
  /** Explicit persistence strategy for collection fields */
  "collection-strategy"?: "jsonb" | "postgres";
}

const EmitterOptionsSchema: JSONSchemaType<GormEmitterOptions> = {
  type: "object",
  additionalProperties: false,
  properties: {
    "output-dir": { type: "string", nullable: true },
    standalone: { type: "boolean", nullable: true },
    "library-name": { type: "string", nullable: true },
    include: { type: "array", items: { type: "string" }, nullable: true },
    exclude: { type: "array", items: { type: "string" }, nullable: true },
    "collection-strategy": { type: "string", nullable: true },
  },
  required: [],
};

export const $lib = createTypeSpecLibrary({
  name: "@qninhdt/typespec-gorm",
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
      severity: "warning",
      messages: {
        default: paramMessage`One-to-many "${"propName"}" on "${"modelName"}" has no inverse many-to-one on "${"targetModel"}". GORM may not resolve the foreign key automatically.`,
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
    "unknown-format": {
      severity: "warning",
      messages: {
        default: paramMessage`@format("${"format"}") on property "${"propName"}" has no Go validate-tag equivalent and will be ignored.`,
      },
    },
  },
  emitter: {
    options: EmitterOptionsSchema,
  },
} as const);

export const { reportDiagnostic } = $lib;
