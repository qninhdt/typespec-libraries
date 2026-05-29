import { createTypeSpecLibrary, type JSONSchemaType } from "@typespec/compiler";
import { diagnostics } from "./diagnostics.js";

/** Tspconfig options consumed by the emitter (Phase 3+). */
export interface ProtoEmitterOptions {
  /** Output directory override handled by TypeSpec. */
  "output-dir"?: string;
  /** Proto syntax. Currently only "proto3" is supported. */
  syntax?: "proto3";
  /** Custom file header replacing the default "DO NOT EDIT" banner. */
  header?: string;
  /** Go module prefix for `option go_package = "..."`. */
  "go-package-prefix"?: string;
  /** Per-well-known-type toggles. See well-known.ts. */
  "well-known"?: {
    timestamp?: boolean;
    duration?: boolean;
    date?: boolean;
    time?: boolean;
    decimal?: boolean;
  };
  /** Suppress empty-request → google.protobuf.Empty rewrite globally. */
  "empty-request-rewrite"?: boolean;
  /** Field-name style. Default snake_case auto-converts camelCase TypeSpec sources. */
  "field-name-style"?: "snake_case" | "camelCase" | "preserve";
  /** Emit cross-file `import` statements (Phase 4). Default true. */
  "emit-imports"?: boolean;
  /** How cross-package import paths are rendered. Default "package-path". */
  "import-path-style"?: "package-path" | "relative" | "flat";
  /** Optional package-name → output file path overrides. */
  "output-paths"?: Record<string, string>;
  /** Restrict which packages are WRITTEN (graph still spans all packages so
   *  cross-package imports resolve). Used by leti/file-worker to avoid
   *  emitting `.proto` files for packages they only consume. */
  "emit-only"?: string[];
  /** Path to the `@entity` field-number allocation JSON, relative to the
   *  TypeSpec project root. Default `.proto-field-allocations.json`. */
  "allocation-file"?: string;
  /** Fail (exit 1) instead of writing the allocation file when it drifts from
   *  the committed copy. CI sets this; local dev leaves it off so the file is
   *  written + committed. Default false. */
  "allocation-check"?: boolean;
  /** Reject ambiguous renames (a dropped field + a new field in one pass)
   *  instead of treating them as delete+add. Default true (Red Team S2). */
  "field-name-rename-strict"?: boolean;
  /** Buf config auto-generation (Phase 6). */
  buf?: {
    /** Emit buf.yaml + buf.gen.yaml. Default true. */
    enabled?: boolean;
    /** Managed-mode go_package prefix (Go services). */
    "go-package-prefix"?: string;
    /** Plugins for buf.gen.yaml. Default ["go", "go-grpc"]. */
    plugins?: Array<"go" | "go-grpc" | "python" | "grpc-python" | "pyi">;
    /** buf-breaking path ignores (intentional file relocations). */
    "breaking-ignore"?: string[];
    /** Cross-module buf dependencies (Red Team D4). */
    deps?: string[];
    /** Overwrite hand-customized configs even when the header marker is gone. */
    force?: boolean;
  };
}

const EmitterOptionsSchema: JSONSchemaType<ProtoEmitterOptions> = {
  type: "object",
  additionalProperties: false,
  properties: {
    "output-dir": { type: "string", nullable: true },
    syntax: { type: "string", enum: ["proto3"], nullable: true },
    header: { type: "string", nullable: true },
    "go-package-prefix": { type: "string", nullable: true },
    "well-known": {
      type: "object",
      additionalProperties: false,
      nullable: true,
      properties: {
        timestamp: { type: "boolean", nullable: true },
        duration: { type: "boolean", nullable: true },
        date: { type: "boolean", nullable: true },
        time: { type: "boolean", nullable: true },
        decimal: { type: "boolean", nullable: true },
      },
      required: [],
    },
    "empty-request-rewrite": { type: "boolean", nullable: true },
    "field-name-style": {
      type: "string",
      enum: ["snake_case", "camelCase", "preserve"],
      nullable: true,
    },
    "emit-imports": { type: "boolean", nullable: true },
    "import-path-style": {
      type: "string",
      enum: ["package-path", "relative", "flat"],
      nullable: true,
    },
    "output-paths": {
      type: "object",
      nullable: true,
      required: [],
      additionalProperties: { type: "string" },
    },
    "emit-only": {
      type: "array",
      items: { type: "string" },
      nullable: true,
    },
    "allocation-file": { type: "string", nullable: true },
    "allocation-check": { type: "boolean", nullable: true },
    "field-name-rename-strict": { type: "boolean", nullable: true },
    buf: {
      type: "object",
      additionalProperties: false,
      nullable: true,
      properties: {
        enabled: { type: "boolean", nullable: true },
        "go-package-prefix": { type: "string", nullable: true },
        plugins: {
          type: "array",
          items: { type: "string", enum: ["go", "go-grpc", "python", "grpc-python", "pyi"] },
          nullable: true,
        },
        "breaking-ignore": { type: "array", items: { type: "string" }, nullable: true },
        deps: { type: "array", items: { type: "string" }, nullable: true },
        force: { type: "boolean", nullable: true },
      },
      required: [],
    },
  },
  required: [],
};

export const $lib = createTypeSpecLibrary({
  name: "@qninhdt/typespec-protobuf-openlet",
  diagnostics,
  emitter: {
    options: EmitterOptionsSchema,
  },
  state: {
    // Message-level
    message: {
      description: "Maps Model → optional override message name (empty string when no override)",
    },
    fieldNumber: { description: "Maps ModelProperty → proto field number (uint32)" },
    reserved: {
      description:
        "Maps Model | Enum → array of ProtoReservation entries (single index, range, or name)",
    },
    oneof: { description: "Maps ModelProperty → oneof group name" },

    // Service-level
    service: { description: "Marks Interface as a proto service" },
    rpc: { description: "Maps Operation → optional override RPC name" },
    keepEmptyRequest: {
      description: "Marks Operation as opting out of empty-request → google.protobuf.Empty rewrite",
    },

    // Field-level
    ignore: { description: "Marks ModelProperty as suppressed in proto emit" },
    rename: {
      description:
        "Maps ModelProperty → explicit proto field name overriding snake_case auto-rename",
    },
    goType: {
      description: "Maps ModelProperty → ProtoGoTypeSpec for Go binding override on bytes / jsonb",
    },
    map: {
      description: "Maps ModelProperty → ProtoMapSpec forcing emission as map<K, V>",
    },

    // Namespace-level
    package: { description: "Maps Namespace → ProtoPackageSpec (name + per-language options)" },
  },
} as const);

export const { reportDiagnostic } = $lib;

/** Fully-qualified TypeSpec namespace where proto decorators are declared. */
export const PROTO_NAMESPACE = "Openlet.Proto";

// ─── State keys ──────────────────────────────────────────────────────────────

export const MessageKey = $lib.stateKeys.message;
export const FieldNumberKey = $lib.stateKeys.fieldNumber;
export const ReservedKey = $lib.stateKeys.reserved;
export const OneofKey = $lib.stateKeys.oneof;

export const ServiceKey = $lib.stateKeys.service;
export const RpcKey = $lib.stateKeys.rpc;
export const KeepEmptyRequestKey = $lib.stateKeys.keepEmptyRequest;

export const IgnoreKey = $lib.stateKeys.ignore;
export const RenameKey = $lib.stateKeys.rename;
export const GoTypeKey = $lib.stateKeys.goType;
export const MapKey = $lib.stateKeys.map;

export const PackageKey = $lib.stateKeys.package;
