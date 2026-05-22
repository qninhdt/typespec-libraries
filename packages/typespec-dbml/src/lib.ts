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
  /** When true, transitively pull required dependencies into the selection */
  "auto-include-dependencies"?: boolean;
  /** Identifier rendered in the DBML `Project { ... }` header (default: "schema") */
  "project-name"?: string;
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
    "auto-include-dependencies": { type: "boolean", nullable: true },
    "project-name": { type: "string", nullable: true },
  },
  required: [],
};

export const $lib = createTypeSpecLibrary({
  name: "@qninhdt/typespec-dbml",
  diagnostics: {
    "unsupported-type": {
      severity: "error",
      messages: {
        default: `Column type could not be mapped to a DBML type.`,
      },
    },
    "invalid-enum-default": {
      severity: "warning",
      messages: {
        default: paramMessage`Default value '${"value"}' is not a member of enum '${"enumName"}'. Known members: ${"members"}.`,
      },
    },
    "emit-write-failed": {
      severity: "error",
      messages: {
        default: paramMessage`Failed to write DBML output: ${"message"}.`,
      },
    },
    "association-column-type-fallback": {
      severity: "error",
      messages: {
        default: paramMessage`Many-to-many join table '${"table"}' has an endpoint key whose type cannot be mapped to DBML; refusing to fall back to a generic type.`,
      },
    },
  },
  emitter: {
    options: EmitterOptionsSchema,
  },
} as const);

export const { reportDiagnostic } = $lib;
