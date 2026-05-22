/**
 * @qninhdt/typespec-zod library definition.
 */

import { createTypeSpecLibrary, paramMessage, type JSONSchemaType } from "@typespec/compiler";

export interface ZodEmitterOptions {
  /** Output directory override handled by TypeSpec */
  "output-dir"?: string;
  /** Whether to generate standalone package (default: false) */
  standalone?: boolean;
  /** Package name for standalone npm package (required when standalone is true) */
  "library-name"?: string;
  /** Namespace selectors to include */
  include?: string[];
  /** Namespace selectors to exclude */
  exclude?: string[];
  /** When true, transitively pull required dependencies into the selection */
  "auto-include-dependencies"?: boolean;
  /**
   * How to render TypeSpec `int64`/`uint64` (and other >32-bit integer)
   * scalars. Defaults to `"string"` to preserve precision over JSON.
   *
   * - `"bigint"`: emit `z.bigint()`. Cannot be JSON-serialized natively.
   * - `"string"`: emit `z.string().regex(/^-?\d+$/)`. Lossless across JSON.
   * - `"number"`: emit `z.number().int()`. Values >2^53 lose precision.
   */
  "int64-strategy"?: "bigint" | "string" | "number";
}

const EmitterOptionsSchema: JSONSchemaType<ZodEmitterOptions> = {
  type: "object",
  additionalProperties: false,
  properties: {
    "output-dir": { type: "string", nullable: true },
    standalone: { type: "boolean", nullable: true },
    "library-name": { type: "string", nullable: true },
    include: { type: "array", items: { type: "string" }, nullable: true },
    exclude: { type: "array", items: { type: "string" }, nullable: true },
    "auto-include-dependencies": { type: "boolean", nullable: true },
    "int64-strategy": {
      type: "string",
      enum: ["bigint", "string", "number"],
      nullable: true,
    },
  },
  required: [],
};

export const $lib = createTypeSpecLibrary({
  name: "@qninhdt/typespec-zod",
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
        default: `Type could not be mapped to a Zod schema.`,
      },
    },
    "emit-write-failed": {
      severity: "error",
      messages: {
        default: paramMessage`Failed to write Zod output: ${"message"}.`,
      },
    },
  },
  emitter: {
    options: EmitterOptionsSchema,
  },
} as const);

export const { reportDiagnostic } = $lib;
