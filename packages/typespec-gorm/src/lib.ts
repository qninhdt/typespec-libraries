import { createTypeSpecLibrary, paramMessage, type JSONSchemaType } from "@typespec/compiler";

export interface GormEmitterOptions {
  /** Go package name for generated files (default: "models") */
  "package-name"?: string;
}

const EmitterOptionsSchema: JSONSchemaType<GormEmitterOptions> = {
  type: "object",
  additionalProperties: false,
  properties: {
    "package-name": { type: "string", nullable: true },
  },
  required: [],
};

export const $lib = createTypeSpecLibrary({
  name: "@qninhdt/typespec-gorm",
  diagnostics: {
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
        default: "No models decorated with @table were found. Nothing to emit.",
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
