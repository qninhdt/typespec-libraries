/**
 * @qninhdt/typespec-zod library definition.
 */

import { createTypeSpecLibrary, type JSONSchemaType } from "@typespec/compiler";

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
  },
  emitter: {
    options: EmitterOptionsSchema,
  },
} as const);

export const { reportDiagnostic } = $lib;
