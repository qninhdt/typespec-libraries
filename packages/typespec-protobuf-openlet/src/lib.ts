import { createTypeSpecLibrary } from "@typespec/compiler";
import { diagnostics } from "./diagnostics.js";

export const $lib = createTypeSpecLibrary({
  name: "@qninhdt/typespec-protobuf-openlet",
  diagnostics,
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
