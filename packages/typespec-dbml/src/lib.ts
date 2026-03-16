/**
 * @qninhdt/typespec-dbml library definition.
 */

import { createTypeSpecLibrary, type JSONSchemaType } from "@typespec/compiler";

export interface DbmlEmitterOptions {
  /** Filename for the generated DBML file (default: "schema") */
  filename?: string;
}

const EmitterOptionsSchema: JSONSchemaType<DbmlEmitterOptions> = {
  type: "object",
  additionalProperties: false,
  properties: {
    filename: { type: "string", nullable: true },
  },
  required: [],
};

export const $lib = createTypeSpecLibrary({
  name: "@qninhdt/typespec-dbml",
  diagnostics: {},
  emitter: {
    options: EmitterOptionsSchema,
  },
} as const);
