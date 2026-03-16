import { createTypeSpecLibrary, paramMessage, type JSONSchemaType } from "@typespec/compiler";

export interface GormEmitterOptions {
  /** Whether to generate standalone Go module (default: false) */
  standalone?: boolean;
  /** Go module name for standalone module (required when standalone is true) */
  "module-name"?: string;
  /** Go package name for generated files (default: "models") */
  "package-name"?: string;
}

const EmitterOptionsSchema: JSONSchemaType<GormEmitterOptions> = {
  type: "object",
  additionalProperties: false,
  properties: {
    standalone: { type: "boolean", nullable: true },
    "module-name": { type: "string", nullable: true },
    "package-name": { type: "string", nullable: true },
  },
  required: [],
};

export const $lib = createTypeSpecLibrary({
  name: "@qninhdt/typespec-gorm",
  diagnostics: {
    "standalone-requires-module-name": {
      severity: "error",
      messages: {
        default: "standalone mode requires 'module-name' option",
      },
    },
    "unsupported-type": {
      severity: "warning",
      messages: {
        default: paramMessage`Type "${"typeName"}" on property "${"propName"}" could not be mapped to a Go type. Using interface{} as fallback.`,
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
