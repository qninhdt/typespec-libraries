/**
 * @qninhdt/typespec-dbml library definition.
 */

import { createTypeSpecLibrary, paramMessage, type JSONSchemaType } from "@typespec/compiler";

export interface DbmlEmitterOptions {
  /** Output directory override handled by TypeSpec */
  "output-dir"?: string;
  /** Filename for the generated DBML file (default: "schema") */
  filename?: string;
  /** Emit one DBML file per namespace group instead of a single schema file */
  "split-by-namespace"?: boolean;
  /** Namespace selectors to include */
  include?: string[];
  /** Namespace selectors to exclude */
  exclude?: string[];
}

const EmitterOptionsSchema: JSONSchemaType<DbmlEmitterOptions> = {
  type: "object",
  additionalProperties: false,
  properties: {
    "output-dir": { type: "string", nullable: true },
    filename: { type: "string", nullable: true },
    "split-by-namespace": { type: "boolean", nullable: true },
    include: { type: "array", items: { type: "string" }, nullable: true },
    exclude: { type: "array", items: { type: "string" }, nullable: true },
  },
  required: [],
};

export const $lib = createTypeSpecLibrary({
  name: "@qninhdt/typespec-dbml",
  diagnostics: {
    "unsupported-type": {
      severity: "warning",
      messages: {
        default: `Column skipped: type could not be mapped to a DBML type.`,
      },
    },
    "emit-write-failed": {
      severity: "error",
      messages: {
        default: paramMessage`Failed to write DBML output: ${"message"}.`,
      },
    },
  },
  emitter: {
    options: EmitterOptionsSchema,
  },
} as const);

export const { reportDiagnostic } = $lib;
