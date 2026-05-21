import { createTypeSpecLibrary, paramMessage, type JSONSchemaType } from "@typespec/compiler";

export interface ProtoEmitterOptions {
  "output-dir"?: string;
  include?: string[];
  exclude?: string[];
}

const EmitterOptionsSchema: JSONSchemaType<ProtoEmitterOptions> = {
  type: "object",
  additionalProperties: false,
  properties: {
    "output-dir": { type: "string", nullable: true },
    include: { type: "array", items: { type: "string" }, nullable: true },
    exclude: { type: "array", items: { type: "string" }, nullable: true },
  },
  required: [],
};

export const $lib = createTypeSpecLibrary({
  name: "@qninhdt/typespec-protobuf",
  diagnostics: {
    "proto-enum-missing-zero": {
      severity: "warning",
      messages: {
        default: `Proto3 enums require a member with value 0. An UNSPECIFIED member will be prepended.`,
      },
    },
    "proto-enum-mixed-values": {
      severity: "error",
      messages: {
        default: `Enum has mixed numeric and string values. Proto enums must be consistently numeric or consistently string.`,
      },
    },
    "proto-unsupported-type": {
      severity: "warning",
      messages: {
        default: `Type cannot be mapped to a proto type and will be emitted as string.`,
      },
    },
    "proto-field-number-conflict": {
      severity: "error",
      messages: {
        default: `Duplicate proto field number detected.`,
      },
    },
    "emit-write-failed": {
      severity: "error",
      messages: {
        default: paramMessage`Failed to write proto output: ${"message"}.`,
      },
    },
  },
  emitter: {
    options: EmitterOptionsSchema,
  },
} as const);

export const { reportDiagnostic, createStateSymbol } = $lib;

export const ProtoPackageKey = createStateSymbol("protoPackage");
export const ProtoServiceKey = createStateSymbol("protoService");
export const StreamKey = createStateSymbol("stream");
export const ProtoFieldKey = createStateSymbol("protoField");
export const ProtoImportKey = createStateSymbol("protoImport");
export const ProtoMapKey = createStateSymbol("protoMap");
