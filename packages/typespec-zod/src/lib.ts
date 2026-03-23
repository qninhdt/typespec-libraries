/**
 * @qninhdt/typespec-zod library definition.
 */

import { createTypeSpecLibrary, type JSONSchemaType } from "@typespec/compiler";

export interface ZodEmitterOptions {
  /** Whether to generate standalone package (default: false) */
  standalone?: boolean;
  /** Package name for standalone npm package (required when standalone is true) */
  "package-name"?: string;
  /** Filename for the generated Zod schemas file (default: "models") */
  filename?: string;
  /** Whether to include template declarations (default: false) */
  includeTemplateDeclaration?: boolean;
  /** Whether to generate discriminated unions (default: true) */
  useDiscriminatedUnions?: boolean;
  /** Whether to emit descriptions (default: true) */
  emitDescriptions?: boolean;
}

const EmitterOptionsSchema: JSONSchemaType<ZodEmitterOptions> = {
  type: "object",
  additionalProperties: false,
  properties: {
    standalone: { type: "boolean", nullable: true },
    "package-name": { type: "string", nullable: true },
    filename: { type: "string", nullable: true },
    includeTemplateDeclaration: { type: "boolean", nullable: true },
    useDiscriminatedUnions: { type: "boolean", nullable: true },
    emitDescriptions: { type: "boolean", nullable: true },
  },
  required: [],
};

export const $lib = createTypeSpecLibrary({
  name: "@qninhdt/typespec-zod",
  diagnostics: {},
  emitter: {
    options: EmitterOptionsSchema,
  },
} as const);
