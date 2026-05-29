import type { Enum, Model, ModelProperty, Program, Scalar, Type } from "@typespec/compiler";
import type { ProtoScalar, ProtoTypeRef } from "./scalars.js";
import { PROTO_MAP_KEY_SCALARS } from "./scalars.js";
import { PROTO_ANY, WELL_KNOWN_BY_TYPESPEC_NAME, WELL_KNOWN_TOGGLE_NAMES } from "./well-known.js";
import { BUILTIN_SCALAR_TO_PROTO } from "./builtin-scalars.js";
import { ORM_SCALAR_TO_PROTO, STORAGE_ONLY_ORM_SCALARS } from "./orm-scalars.js";
import { getScalarChain, getQualifiedTypeName } from "./utils.js";
import { getProtoMap, getProtoGoType } from "../state-accessors.js";

/**
 * Diagnostic surfaced by the resolver when no proto mapping applies. The
 * caller (Phase 3 emitter) is expected to translate these into proper
 * compiler diagnostics with source locations.
 */
export type ProtoTypeResolutionWarning =
  | { kind: "unknown-type"; typeName: string }
  | { kind: "storage-only-scalar"; scalarName: string }
  | { kind: "anonymous-model" }
  | { kind: "invalid-map-key"; keyTypeName: string }
  | { kind: "nested-map" };

/**
 * Result of resolving a property's type. `ref` is always set; `warnings`
 * accumulates non-fatal diagnostics encountered during resolution. Fatal
 * cases (e.g. an unresolvable scalar) still produce a `ProtoTypeRef` of
 * `{ kind: "any" }` so the caller never has to handle a missing ref.
 */
export interface ProtoTypeResolution {
  ref: ProtoTypeRef;
  warnings: ProtoTypeResolutionWarning[];
}

/**
 * Resolver options. The Phase 3 emitter passes these through from
 * `tspconfig.yaml`. Defaults match the documented surface; toggles are
 * honored even when unset (treated as `true`).
 */
export interface ResolveProtoTypeOptions {
  /**
   * Per-well-known-type toggles. Keyed by the lowercase short name (see
   * `WELL_KNOWN_TOGGLE_NAMES`). When a key is `false`, the resolver emits
   * the fallback type instead of the well-known wrapper:
   * - `timestamp` / `duration` → `int64` (epoch milliseconds)
   * - `date` / `time` → `string` (ISO 8601)
   * - `decimal` → `string`
   */
  wellKnown?: Partial<Record<string, boolean>>;
}

/**
 * Resolve a TypeSpec type (typically a `ModelProperty`'s type) to a
 * `ProtoTypeRef`. The walker order matches Phase 2's spec:
 *
 *   1. Decorator overrides on the property: `@map`, `@goType`.
 *   2. Array unwrap (`Array<T>`) → `repeated T`.
 *   3. Record unwrap (`Record<V>`) → `map<string, V>`.
 *   4. Well-known TypeSpec scalars (Timestamp, Duration, Date, ...).
 *   5. ORM scalars (uuid, jsonb, semantic strings, ...).
 *   6. Built-in proto scalars (string, int32, bool, ...).
 *   7. Model reference → `{ kind: "message", ... }`.
 *   8. Enum reference  → `{ kind: "enum", ... }`.
 *   9. Fallback to `google.protobuf.Any` + warning.
 */
export function resolveProtoType(
  program: Program,
  prop: ModelProperty,
  opts: ResolveProtoTypeOptions = {},
): ProtoTypeResolution {
  // 1. @map override on the property — emit map<K, V> with both sides verbatim.
  const mapOverride = getProtoMap(program, prop);
  if (mapOverride) {
    const key = mapOverride.key as ProtoScalar;
    if (!PROTO_MAP_KEY_SCALARS.has(key)) {
      return {
        ref: PROTO_ANY,
        warnings: [{ kind: "invalid-map-key", keyTypeName: mapOverride.key }],
      };
    }
    return {
      ref: {
        kind: "map",
        key,
        value: { kind: "scalar", name: mapOverride.value as ProtoScalar },
      },
      warnings: [],
    };
  }

  // 2. @goType override — coerces to bytes wire type with a per-language
  // binding hint that the emitter renders as a `[(go.type) = ...]` option.
  const goType = getProtoGoType(program, prop);
  if (goType && goType.raw !== "") {
    return { ref: { kind: "scalar", name: "bytes" }, warnings: [] };
  }

  return resolveTypeRef(program, prop.type, opts);
}

/**
 * Recursive worker. Exported for the Phase 3 emitter to resolve nested types
 * (array elements, record values) without re-running the property-level
 * decorator checks.
 */
export function resolveTypeRef(
  program: Program,
  type: Type,
  opts: ResolveProtoTypeOptions,
): ProtoTypeResolution {
  // ModelProperty lookup syntax (`User.email`) — unwrap.
  if (type.kind === "ModelProperty") {
    return resolveTypeRef(program, type.type, opts);
  }

  // 2/3. Arrays + records (Records are intrinsic Models with an indexer).
  if (type.kind === "Model" && type.indexer) {
    return resolveIndexedType(program, type, opts);
  }

  if (type.kind === "Scalar") {
    return resolveScalar(program, type, opts);
  }

  if (type.kind === "Model") {
    return resolveModel(program, type);
  }

  if (type.kind === "Enum") {
    return resolveEnum(program, type);
  }

  return {
    ref: PROTO_ANY,
    warnings: [{ kind: "unknown-type", typeName: (type as { kind: string }).kind ?? "unknown" }],
  };
}

// ─── Per-kind workers ──────────────────────────────────────────────────────

function resolveScalar(
  program: Program,
  scalar: Scalar,
  opts: ResolveProtoTypeOptions,
): ProtoTypeResolution {
  const chain = getScalarChain(scalar);

  // 4. Well-known check (most-specific first).
  for (const name of chain) {
    const wk = WELL_KNOWN_BY_TYPESPEC_NAME.get(name);
    if (!wk) continue;
    const fallback = applyWellKnownToggle(name, wk, opts);
    return { ref: fallback, warnings: [] };
  }

  // 5. Storage-only ORM scalar — diagnostic + Any fallback so authors must
  // declare intent via @map / @goType.
  for (const name of chain) {
    if (STORAGE_ONLY_ORM_SCALARS.has(name)) {
      return {
        ref: PROTO_ANY,
        warnings: [{ kind: "storage-only-scalar", scalarName: name }],
      };
    }
  }

  // 6. ORM scalar mapping (uuid → string, serial → int32, etc.).
  for (const name of chain) {
    const proto = ORM_SCALAR_TO_PROTO.get(name);
    if (proto !== undefined) return { ref: { kind: "scalar", name: proto }, warnings: [] };
  }

  // 7. Built-in proto scalar (string, int32, bool, ...).
  for (const name of chain) {
    const proto = BUILTIN_SCALAR_TO_PROTO.get(name);
    if (proto !== undefined) return { ref: { kind: "scalar", name: proto }, warnings: [] };
  }

  // Custom scalar with no recognized base — fall back to string + warning.
  return {
    ref: PROTO_ANY,
    warnings: [{ kind: "unknown-type", typeName: scalar.name }],
  };
}

function resolveModel(program: Program, model: Model): ProtoTypeResolution {
  if (!model.name) {
    // Anonymous models (e.g. inline operation parameter blocks) cannot
    // round-trip to proto messages — they have no qualified name to emit.
    return { ref: PROTO_ANY, warnings: [{ kind: "anonymous-model" }] };
  }
  return {
    ref: { kind: "message", model, qualifiedName: getQualifiedTypeName(program, model) },
    warnings: [],
  };
}

function resolveEnum(program: Program, enumType: Enum): ProtoTypeResolution {
  return {
    ref: { kind: "enum", enum: enumType, qualifiedName: getQualifiedTypeName(program, enumType) },
    warnings: [],
  };
}

function resolveIndexedType(
  program: Program,
  model: Model,
  opts: ResolveProtoTypeOptions,
): ProtoTypeResolution {
  if (!model.indexer) {
    return { ref: PROTO_ANY, warnings: [{ kind: "unknown-type", typeName: "Model" }] };
  }
  const keyType = model.indexer.key;
  const valueType = model.indexer.value;

  // Array<T> uses the special integer indexer keyed on `integer`. Treat
  // anything with a non-string key as repeated when the key is the
  // built-in array indexer.
  const isArray = keyType.kind === "Scalar" && keyType.name === "integer";
  if (isArray) {
    const elem = resolveTypeRef(program, valueType, opts);
    return {
      ref: { kind: "repeated", element: elem.ref },
      warnings: elem.warnings,
    };
  }

  // Record<V> / Map<K, V> — proto requires scalar keys.
  const keyResolution = resolveTypeRef(program, keyType, opts);
  if (keyResolution.ref.kind !== "scalar" || !PROTO_MAP_KEY_SCALARS.has(keyResolution.ref.name)) {
    return {
      ref: PROTO_ANY,
      warnings: [
        ...keyResolution.warnings,
        {
          kind: "invalid-map-key",
          keyTypeName:
            keyType.kind === "Scalar" ? keyType.name : (keyType as { kind: string }).kind,
        },
      ],
    };
  }

  const valueResolution = resolveTypeRef(program, valueType, opts);
  if (valueResolution.ref.kind === "map" || valueResolution.ref.kind === "repeated") {
    // proto3 forbids nested maps and repeated map values.
    return {
      ref: PROTO_ANY,
      warnings: [...keyResolution.warnings, ...valueResolution.warnings, { kind: "nested-map" }],
    };
  }

  return {
    ref: {
      kind: "map",
      key: keyResolution.ref.name,
      value: valueResolution.ref,
    },
    warnings: [...keyResolution.warnings, ...valueResolution.warnings],
  };
}

/**
 * Apply the per-well-known-type toggle. Returns the well-known ref unchanged
 * when the toggle is on (default); falls back to a plain wire type when off.
 */
function applyWellKnownToggle(
  scalarName: string,
  wk: ProtoTypeRef,
  opts: ResolveProtoTypeOptions,
): ProtoTypeRef {
  const shortName = wellKnownShortName(scalarName);
  if (!shortName || !WELL_KNOWN_TOGGLE_NAMES.has(shortName)) return wk;
  const enabled = opts.wellKnown?.[shortName];
  if (enabled === false) {
    return wellKnownFallback(shortName);
  }
  return wk;
}

function wellKnownShortName(scalarName: string): string | undefined {
  switch (scalarName) {
    case "utcDateTime":
    case "offsetDateTime":
      return "timestamp";
    case "duration":
      return "duration";
    case "plainDate":
      return "date";
    case "plainTime":
      return "time";
    case "decimal":
      return "decimal";
    default:
      return undefined;
  }
}

function wellKnownFallback(shortName: string): ProtoTypeRef {
  switch (shortName) {
    case "timestamp":
    case "duration":
      // Epoch milliseconds. Documented surface in README.
      return { kind: "scalar", name: "int64" };
    case "decimal":
    case "date":
    case "time":
    default:
      return { kind: "scalar", name: "string" };
  }
}
