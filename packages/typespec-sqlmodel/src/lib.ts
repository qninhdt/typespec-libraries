import { createTypeSpecLibrary, paramMessage, type JSONSchemaType } from "@typespec/compiler";

export interface SqlModelEmitterOptions {
  /** Python module name for generated files (default: "models") */
  "module-name"?: string;
}

const EmitterOptionsSchema: JSONSchemaType<SqlModelEmitterOptions> = {
  type: "object",
  additionalProperties: false,
  properties: {
    "module-name": { type: "string", nullable: true },
  },
  required: [],
};

export const $lib = createTypeSpecLibrary({
  name: "@qninhdt/typespec-sqlmodel",
  diagnostics: {
    "unsupported-type": {
      severity: "warning",
      messages: {
        default: paramMessage`Type "${"typeName"}" on property "${"propName"}" could not be mapped to a Python type. Using Any as fallback.`,
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
    "unknown-format": {
      severity: "warning",
      messages: {
        default: paramMessage`@format("${"format"}") on property "${"propName"}" has no Python/Pydantic equivalent and will be ignored.`,
      },
    },
    "foreign-key-target-not-table": {
      severity: "error",
      messages: {
        default: paramMessage`@foreignKey on "${"propName"}": the property type must be a model decorated with @table, but "${"typeName"}" is not.`,
      },
    },
  },
  emitter: {
    options: EmitterOptionsSchema,
  },
} as const);

export const { reportDiagnostic } = $lib;
