import type { ProtoTypeRef } from "./scalars.js";

/**
 * TypeSpec scalar (or alias) name → well-known proto type descriptor.
 *
 * The mapping covers the common cases observed in openlet: timestamps,
 * durations, dates, times. `decimal` defaults to `google.type.Decimal` (the
 * canonical, precision-preserving representation since 2023); the emitter
 * (Phase 3) flips it to a plain `string` when `well-known.decimal` is disabled
 * in `tspconfig`.
 *
 * Entries here are queried by the resolver when a property's scalar matches a
 * well-known TypeSpec built-in. ORM semantic scalars (e.g. `email`) are NOT
 * here — they fall through to `string` via the orm-scalars bridge.
 */
export const WELL_KNOWN_BY_TYPESPEC_NAME: ReadonlyMap<string, ProtoTypeRef> = new Map<
  string,
  ProtoTypeRef
>([
  [
    "utcDateTime",
    {
      kind: "wellKnown",
      name: "google.protobuf.Timestamp",
      importPath: "google/protobuf/timestamp.proto",
    },
  ],
  [
    "offsetDateTime",
    {
      kind: "wellKnown",
      name: "google.protobuf.Timestamp",
      importPath: "google/protobuf/timestamp.proto",
    },
  ],
  [
    "duration",
    {
      kind: "wellKnown",
      name: "google.protobuf.Duration",
      importPath: "google/protobuf/duration.proto",
    },
  ],
  [
    "plainDate",
    {
      kind: "wellKnown",
      name: "google.type.Date",
      importPath: "google/type/date.proto",
    },
  ],
  [
    "plainTime",
    {
      kind: "wellKnown",
      name: "google.type.TimeOfDay",
      importPath: "google/type/timeofday.proto",
    },
  ],
  [
    "decimal",
    {
      kind: "wellKnown",
      name: "google.type.Decimal",
      importPath: "google/type/decimal.proto",
    },
  ],
]);

/**
 * `google.protobuf.Empty` reference. Used by the emitter (Phase 3) to rewrite
 * empty-request operations and to support intentional empty messages.
 */
export const PROTO_EMPTY: ProtoTypeRef = {
  kind: "wellKnown",
  name: "google.protobuf.Empty",
  importPath: "google/protobuf/empty.proto",
};

/**
 * `google.protobuf.Any` reference. Returned by the resolver as a typed escape
 * hatch when no other mapping applies (paired with a diagnostic).
 */
export const PROTO_ANY: ProtoTypeRef = {
  kind: "wellKnown",
  name: "google.protobuf.Any",
  importPath: "google/protobuf/any.proto",
};

/**
 * The set of TypeSpec scalar names whose well-known mapping is gated on the
 * `well-known.<name>` tspconfig flag (Phase 3 reads this when bootstrapping
 * the emitter context).
 */
export const WELL_KNOWN_TOGGLE_NAMES: ReadonlySet<string> = new Set([
  "timestamp",
  "duration",
  "date",
  "time",
  "decimal",
]);
