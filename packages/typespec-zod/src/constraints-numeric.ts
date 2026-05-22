/**
 * Numeric constraint resolution. Resolves @minValue/@maxValue and exclusive
 * variants from decorators on properties and scalars (and inherited from
 * base scalars), then emits z.gte()/z.lte()/z.gt()/z.lt() / z.nonnegative()
 * parts. Note: Zod 4's `z.number().int()` already enforces the safe-integer
 * range, so `safeint` does not emit a redundant `.safe()` (which doesn't
 * exist on number schemas in Zod 4 anyway).
 */

import { Children } from "@alloy-js/core/jsx-runtime";
import { ModelProperty, Scalar, Type } from "@typespec/compiler";
import { Typekit } from "@typespec/compiler/typekit";
import { callPart } from "./utils.js";
import {
  getDecoratorSources,
  maxNumeric,
  minNumeric,
  NumericValue,
  unwrapLookupType,
} from "./constraints-utils.js";

interface NumericConstraints {
  min?: NumericValue;
  max?: NumericValue;
  minExclusive?: NumericValue;
  maxExclusive?: NumericValue;
  multipleOf?: number;
}

export function numericConstraintsParts($: Typekit, type: Scalar, member?: ModelProperty) {
  const sources = getDecoratorSources($, type, member);
  const intrinsic = intrinsicNumericConstraints($, type);
  const decorator = decoratorNumericConstraints($, sources);

  resolveOverlappingNumericBounds(decorator, intrinsic);

  const final: NumericConstraints = {};
  assignNumericConstraints(final, intrinsic);
  assignNumericConstraints(final, decorator);

  return numericConstraintsToParts(final);
}

export function isEncodedNumericScalar($: Typekit, type: Type): type is Scalar {
  return (
    $.scalar.extendsUtcDateTime(type) ||
    $.scalar.extendsOffsetDateTime(type) ||
    $.scalar.extendsDuration(type)
  );
}

export function encodedNumericConstraints($: Typekit, type: Scalar): Children[] {
  const encoding = $.scalar.getEncoding(type);
  return encoding ? numericConstraintsToParts(intrinsicNumericConstraints($, encoding.type)) : [];
}

function numericConstraintsToParts(constraints: NumericConstraints): Children[] {
  const parts: Children[] = [];

  for (const [name, value] of Object.entries(constraints)) {
    if (value === undefined || (typeof value !== "bigint" && !Number.isFinite(value))) {
      continue;
    }

    if (name === "multipleOf") {
      // `z.number().multipleOf(x)` exists in Zod 4. We avoid `.step()`
      // because it's an alias and `.multipleOf()` matches the TypeSpec
      // decorator name verbatim.
      parts.push(callPart("multipleOf", `${value}`));
      continue;
    }

    if (name === "min" && (value === 0 || value === 0n)) {
      parts.push(callPart("nonnegative"));
      continue;
    }
    parts.push(
      callPart(
        zodNumericConstraintName(name),
        typeof value === "bigint" ? `${value}n` : `${value}`,
      ),
    );
  }

  return parts;
}

function zodNumericConstraintName(name: string): string {
  switch (name) {
    case "min":
      return "gte";
    case "max":
      return "lte";
    case "minExclusive":
      return "gt";
    case "maxExclusive":
      return "lt";
    default:
      throw new Error(`Unknown constraint name: ${name}`);
  }
}

function intrinsicNumericConstraints($: Typekit, type: Scalar): NumericConstraints {
  const known = $.scalar.getStdBase(type);
  if (!known || !$.scalar.extendsNumeric(known)) return {};
  // Note: `safeint` previously emitted `.safe()`; in Zod 4 the safe-integer
  // range is already enforced by `.int()`, and `.safe()` does not exist on
  // number schemas. So no intrinsic numeric constraint is needed here.
  return {};
}

function decoratorNumericConstraints($: Typekit, sources: Type[]): NumericConstraints {
  const final: NumericConstraints = {};
  for (const source of sources) {
    assignNumericConstraints(final, {
      max: $.type.maxValue(source),
      maxExclusive: $.type.maxValueExclusive(source),
      min: $.type.minValue(source),
      minExclusive: $.type.minValueExclusive(source),
      multipleOf: extractMultipleOf(source),
    });
  }
  return final;
}

/**
 * `@multipleOf` lives in `@typespec/json-schema` (not in the compiler's std
 * decorators), so the typekit doesn't expose a typed accessor for it. We
 * read it directly off the type's `decorators` list by name; this works
 * regardless of whether `@typespec/json-schema` is installed because we only
 * inspect what's already attached.
 */
function extractMultipleOf(source: Type): number | undefined {
  if (!("decorators" in source) || !Array.isArray(source.decorators)) return undefined;
  for (const dec of source.decorators) {
    const name = dec.definition?.name ?? dec.decorator?.name ?? "";
    // `definition.name` is `@multipleOf`, function name is `$multipleOf`.
    if (name !== "@multipleOf" && name !== "$multipleOf") continue;
    const arg = dec.args[0];
    if (!arg) continue;
    const js = arg.jsValue;
    if (typeof js === "number") return js;
    if (typeof js === "bigint") return Number(js);
    if (js && typeof js === "object" && "asNumber" in js) {
      const n = (js as { asNumber: () => number | null }).asNumber();
      if (typeof n === "number") return n;
    }
  }
  return undefined;
}

function assignNumericConstraints(target: NumericConstraints, source: NumericConstraints) {
  target.min = maxNumeric(target.min, source.min);
  target.max = minNumeric(target.max, source.max);
  target.minExclusive = maxNumeric(source.minExclusive, target.minExclusive);
  target.maxExclusive = minNumeric(source.maxExclusive, target.maxExclusive);
}

/**
 * When both inclusive and exclusive bounds are present (or intrinsic and
 * decorator versions overlap), drop the looser one so the emitted schema
 * only carries a single bound on each side.
 */
function resolveOverlappingNumericBounds(
  decorator: NumericConstraints,
  intrinsic: NumericConstraints,
): void {
  // decorator vs decorator (inclusive vs exclusive on the same side)
  if (decorator.min !== undefined && decorator.minExclusive !== undefined) {
    if (decorator.minExclusive > decorator.min) delete decorator.min;
    else delete decorator.minExclusive;
  }
  if (decorator.max !== undefined && decorator.maxExclusive !== undefined) {
    if (decorator.maxExclusive < decorator.max) delete decorator.max;
    else delete decorator.maxExclusive;
  }

  // intrinsic vs decorator: keep the tighter bound, drop the looser
  resolveIntrinsicVsDecorator("min", intrinsic, decorator);
  resolveIntrinsicVsDecorator("max", intrinsic, decorator);
}

function resolveIntrinsicVsDecorator(
  side: "min" | "max",
  intrinsic: NumericConstraints,
  decorator: NumericConstraints,
): void {
  const intrinsicValue = intrinsic[side];
  if (intrinsicValue === undefined) return;

  const exclusiveKey = side === "min" ? "minExclusive" : "maxExclusive";
  const intrinsicWins = (i: NumericValue, d: NumericValue) => (side === "min" ? i > d : i < d);

  // Compare against same-kind decorator bound first, then exclusive variant.
  for (const decoratorKey of [side, exclusiveKey] as const) {
    const decoratorValue = decorator[decoratorKey];
    if (decoratorValue === undefined) continue;

    if (intrinsicWins(intrinsicValue, decoratorValue)) {
      delete decorator[decoratorKey];
    } else {
      delete intrinsic[side];
    }
    return;
  }
}

export { unwrapLookupType };
