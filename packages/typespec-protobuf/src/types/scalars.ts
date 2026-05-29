import type { Enum, Model } from "@typespec/compiler";

/**
 * Native proto scalar types. Mirrors the proto3 scalar wire types verbatim so
 * the emitter (Phase 3) can emit a `ProtoScalar` value as-is into the `.proto`
 * file.
 */
export type ProtoScalar =
  | "double"
  | "float"
  | "int32"
  | "int64"
  | "uint32"
  | "uint64"
  | "sint32"
  | "sint64"
  | "fixed32"
  | "fixed64"
  | "sfixed32"
  | "sfixed64"
  | "bool"
  | "string"
  | "bytes";

/**
 * Set of valid proto map key types (everything except `bytes`, `float`,
 * `double`, and message types — proto3 spec restriction).
 */
export const PROTO_MAP_KEY_SCALARS: ReadonlySet<ProtoScalar> = new Set<ProtoScalar>([
  "int32",
  "int64",
  "uint32",
  "uint64",
  "sint32",
  "sint64",
  "fixed32",
  "fixed64",
  "sfixed32",
  "sfixed64",
  "bool",
  "string",
]);

/**
 * Resolved proto type descriptor produced by the resolver. The emitter walks
 * this tagged union and renders each variant directly into the `.proto`
 * source.
 *
 * `qualifiedName` on `message` / `enum` refs is the TypeSpec-namespace-qualified
 * name (e.g. `Openlet.UserProto.GetUserResponse`). Phase 4 will rewrite these
 * into proto-package-qualified names (`openlet.user.v1.GetUserResponse`) once
 * the `@package` namespace map is built.
 */
export type ProtoTypeRef =
  | { kind: "scalar"; name: ProtoScalar }
  | { kind: "wellKnown"; name: string; importPath: string }
  | { kind: "message"; model: Model; qualifiedName: string }
  | { kind: "enum"; enum: Enum; qualifiedName: string }
  | { kind: "repeated"; element: ProtoTypeRef }
  | { kind: "map"; key: ProtoScalar; value: ProtoTypeRef }
  | { kind: "any" };
