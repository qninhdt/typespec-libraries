/**
 * Numeric constraint resolution. Resolves @minValue/@maxValue and exclusive
 * variants from decorators on properties and scalars (and inherited from
 * base scalars), then emits z.gte()/z.lte()/z.gt()/z.lt() / z.safe() / z.nonnegative()
 * parts.
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
  safe?: boolean;
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

  if (constraints.safe) {
    parts.push(callPart("safe"));
  }

  for (const [name, value] of Object.entries(constraints)) {
    if (value === undefined || (typeof value !== "bigint" && !Number.isFinite(value))) {
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
  if ($.scalar.extendsSafeint(known)) return { safe: true };
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
    });
  }
  return final;
}

function assignNumericConstraints(target: NumericConstraints, source: NumericConstraints) {
  target.min = maxNumeric(target.min, source.min);
  target.max = minNumeric(target.max, source.max);
  target.minExclusive = maxNumeric(source.minExclusive, target.minExclusive);
  target.maxExclusive = minNumeric(source.maxExclusive, target.maxExclusive);
  target.safe = target.safe ?? source.safe;
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
  const intrinsicWins = (i: NumericValue, d: NumericValue) =>
    side === "min" ? i > d : i < d;

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
