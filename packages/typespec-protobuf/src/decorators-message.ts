import type { DecoratorContext, Enum, Model, ModelProperty } from "@typespec/compiler";
import { MessageKey, FieldNumberKey, ReservedKey, OneofKey } from "./lib.js";

/**
 * A single proto reservation. Stored as a tagged union so the emitter can
 * uniformly walk reservations on both messages and enums.
 */
export type ProtoReservation =
  | { kind: "index"; value: number }
  | { kind: "range"; start: number; end: number }
  | { kind: "name"; value: string };

/**
 * Marks a model as a proto message. The optional `overrideName` overrides the
 * emitted message name when the TypeSpec model name differs from the desired
 * proto identifier. Stored as the empty string when no override is supplied so
 * a `has()` check is sufficient for "is a message" detection.
 */
export function $message(context: DecoratorContext, target: Model, overrideName?: string): void {
  context.program.stateMap(MessageKey).set(target, overrideName ?? "");
}

/**
 * Pins the proto field number for a model property. Phase 1 stores the value
 * verbatim — range/duplicate validation lands in Phase 3 alongside the
 * emitter.
 */
export function $field(context: DecoratorContext, target: ModelProperty, index: number): void {
  context.program.stateMap(FieldNumberKey).set(target, index);
}

/**
 * Reserves field numbers, ranges, and names on a message or enum. Each raw
 * reservation argument is normalized into a {@link ProtoReservation} entry and
 * appended to the model's reservation array.
 *
 * Reservation arrays accumulate across multiple `@reserve(...)` calls on the
 * same target.
 */
export function $reserve(
  context: DecoratorContext,
  target: Model | Enum,
  ...reservations: Array<string | number | readonly [number, number]>
): void {
  const map = context.program.stateMap(ReservedKey);
  const existing = (map.get(target) as ProtoReservation[] | undefined) ?? [];
  for (const raw of reservations) {
    if (typeof raw === "string") {
      existing.push({ kind: "name", value: raw });
    } else if (typeof raw === "number") {
      existing.push({ kind: "index", value: raw });
    } else if (Array.isArray(raw) && raw.length === 2) {
      const [start, end] = raw as readonly [number, number];
      existing.push({ kind: "range", start, end });
    }
  }
  map.set(target, existing);
}

/**
 * Groups a property into a named `oneof` block. All properties on the same
 * model that carry `@oneof("foo")` emit as members of `oneof foo`.
 */
export function $oneof(context: DecoratorContext, target: ModelProperty, name: string): void {
  context.program.stateMap(OneofKey).set(target, name);
}
