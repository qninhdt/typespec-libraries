import type {
  Enum,
  Interface,
  Model,
  ModelProperty,
  Namespace,
  Operation,
  Program,
} from "@typespec/compiler";
import {
  MessageKey,
  FieldNumberKey,
  ReservedKey,
  OneofKey,
  ServiceKey,
  RpcKey,
  KeepEmptyRequestKey,
  IgnoreKey,
  RenameKey,
  GoTypeKey,
  MapKey,
  PackageKey,
} from "./lib.js";
import type { ProtoReservation } from "./decorators-message.js";
import type { ProtoPackageSpec } from "./decorators-service.js";
import type { ProtoGoTypeSpec, ProtoMapSpec } from "./decorators-field.js";

// ─── Message-level accessors ────────────────────────────────────────────────

/** True when the model carries `@message`. */
export function isProtoMessage(program: Program, model: Model): boolean {
  return program.stateMap(MessageKey).has(model);
}

/**
 * Returns the explicit `@message(overrideName)` value when present, otherwise
 * `undefined`. The emitter falls back to the model's TypeSpec name in that
 * case.
 */
export function getProtoMessageOverrideName(program: Program, model: Model): string | undefined {
  const stored = program.stateMap(MessageKey).get(model);
  if (typeof stored !== "string" || stored === "") return undefined;
  return stored;
}

/**
 * Returns the explicit `@field(N)` value when present. Phase 5's allocator
 * supplies values for `@entity` properties that don't carry an explicit
 * decorator.
 */
export function getProtoFieldNumber(program: Program, prop: ModelProperty): number | undefined {
  const stored = program.stateMap(FieldNumberKey).get(prop);
  return typeof stored === "number" ? stored : undefined;
}

/** Returns the array of reservations applied to a message or enum. */
export function getProtoReservations(program: Program, target: Model | Enum): ProtoReservation[] {
  return (program.stateMap(ReservedKey).get(target) as ProtoReservation[] | undefined) ?? [];
}

/** Returns the `@oneof` group name for a property, or `undefined`. */
export function getProtoOneof(program: Program, prop: ModelProperty): string | undefined {
  const stored = program.stateMap(OneofKey).get(prop);
  return typeof stored === "string" ? stored : undefined;
}

// ─── Service-level accessors ────────────────────────────────────────────────

/** True when the interface carries `@service`. */
export function isProtoService(program: Program, iface: Interface): boolean {
  return program.stateMap(ServiceKey).has(iface);
}

/**
 * Returns the explicit `@rpc(overrideName)` value when present, otherwise
 * `undefined`. The emitter falls back to the operation's TypeSpec name.
 */
export function getProtoRpcOverrideName(program: Program, op: Operation): string | undefined {
  const stored = program.stateMap(RpcKey).get(op);
  if (typeof stored !== "string" || stored === "") return undefined;
  return stored;
}

/** True when the operation carries `@keepEmptyRequest`. */
export function isKeepEmptyRequest(program: Program, op: Operation): boolean {
  return program.stateMap(KeepEmptyRequestKey).has(op);
}

// ─── Field-level accessors ──────────────────────────────────────────────────

/** True when the property carries `@ignore` (proto-side). */
export function isProtoIgnored(program: Program, prop: ModelProperty): boolean {
  return program.stateMap(IgnoreKey).has(prop);
}

/** Returns the `@rename(name)` value when present. */
export function getProtoFieldName(program: Program, prop: ModelProperty): string | undefined {
  const stored = program.stateMap(RenameKey).get(prop);
  return typeof stored === "string" ? stored : undefined;
}

/** Returns the `@goType(...)` spec when present. */
export function getProtoGoType(program: Program, prop: ModelProperty): ProtoGoTypeSpec | undefined {
  return program.stateMap(GoTypeKey).get(prop) as ProtoGoTypeSpec | undefined;
}

/** Returns the `@map(key, value)` spec when present. */
export function getProtoMap(program: Program, prop: ModelProperty): ProtoMapSpec | undefined {
  return program.stateMap(MapKey).get(prop) as ProtoMapSpec | undefined;
}

// ─── Namespace-level accessors ─────────────────────────────────────────────

/** Returns the `@package(...)` spec for a namespace when present. */
export function getProtoPackage(program: Program, ns: Namespace): ProtoPackageSpec | undefined {
  return program.stateMap(PackageKey).get(ns) as ProtoPackageSpec | undefined;
}
