import type { ProtoScalar } from "./scalars.js";

/**
 * TypeSpec built-in scalar name → proto wire type. Walked by the resolver
 * after well-known matches and ORM semantic-scalar matches have failed.
 *
 * The table is intentionally minimal: it covers TypeSpec's intrinsic scalars
 * plus the few orm-defined ones whose proto representation is unambiguous
 * (`text`, `numeric`). ORM semantic scalars that always degrade to `string`
 * (`email`, `url`, etc.) live in `orm-scalars.ts` so they can be toggled
 * separately from this table.
 *
 * Notes:
 * - `int8` / `int16` and `uint8` / `uint16` widen to `int32` / `uint32` —
 *   proto has no narrower integer wire types.
 * - `numeric` defaults to `string` for precision preservation; authors who
 *   want `google.type.Decimal` should use the `decimal` scalar instead.
 * - `safeint` / `integer` widen to `int64`. Proto has no JS-safe-integer.
 */
export const BUILTIN_SCALAR_TO_PROTO: ReadonlyMap<string, ProtoScalar> = new Map<
  string,
  ProtoScalar
>([
  // Strings
  ["string", "string"],
  ["text", "string"],

  // Boolean
  ["boolean", "bool"],

  // Signed ints
  ["int8", "int32"],
  ["int16", "int32"],
  ["int32", "int32"],
  ["int64", "int64"],
  ["safeint", "int64"],
  ["integer", "int64"],

  // Unsigned ints
  ["uint8", "uint32"],
  ["uint16", "uint32"],
  ["uint32", "uint32"],
  ["uint64", "uint64"],

  // Float
  ["float32", "float"],
  ["float64", "double"],
  ["float", "double"],

  // Bytes
  ["bytes", "bytes"],

  // Numeric (precision-preserving)
  ["numeric", "string"],

  // Proto-native variants exposed by upstream's @typespec/protobuf
  // (kept for compat — authors who explicitly want non-default encodings).
  ["sint32", "sint32"],
  ["sint64", "sint64"],
  ["sfixed32", "sfixed32"],
  ["sfixed64", "sfixed64"],
  ["fixed32", "fixed32"],
  ["fixed64", "fixed64"],
]);
