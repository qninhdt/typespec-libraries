/**
 * Zod constraints - handles TypeSpec constraints and converts them to Zod.
 */

import { Children } from "@alloy-js/core/jsx-runtime";
import { getFormat, getPattern, ModelProperty, Scalar, Type } from "@typespec/compiler";
import { Typekit } from "@typespec/compiler/typekit";
import { useTsp } from "@typespec/emitter-framework";
import { callPart, shouldReference } from "./utils.js";

export function zodConstraintsParts(type: Type, member?: ModelProperty) {
  const { $ } = useTsp();
  const { effectiveType, effectiveMember } = unwrapLookupType($, type, member);

  if ($.scalar.extendsNumeric(effectiveType)) {
    return numericConstraintsParts($, effectiveType, effectiveMember);
  }

  if ($.scalar.extendsString(effectiveType)) {
    return stringConstraints($, effectiveType, effectiveMember);
  }

  if (isEncodedNumericScalar($, effectiveType)) {
    return encodedNumericConstraints($, effectiveType);
  }

  if ($.array.is(effectiveType)) {
    return arrayConstraints($, effectiveType, effectiveMember);
  }

  return [];
}

interface StringConstraints {
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;
  doc?: string;
}

function stringConstraints($: Typekit, type: Scalar, member?: ModelProperty) {
  const sources = getDecoratorSources($, type, member);
  const constraints: StringConstraints = {};
  for (const source of [...sources].reverse()) {
    const decoratorConstraints: StringConstraints = {
      minLength: $.type.minLength(source),
      maxLength: $.type.maxLength(source),
      pattern: getPattern($.program, source),
      format: getFormat($.program, source),
    };

    assignStringConstraints(constraints, decoratorConstraints);
  }

  const parts: Children[] = [];

  if (constraints.minLength !== undefined && constraints.minLength !== 0) {
    parts.push(callPart("min", constraints.minLength));
  }
  if (constraints.maxLength !== undefined && Number.isFinite(constraints.maxLength)) {
    parts.push(callPart("max", constraints.maxLength));
  }
  if (constraints.pattern !== undefined) {
    parts.push(callPart("regex", `/${constraints.pattern}/`));
  }
  if (constraints.format !== undefined) {
    parts.push(callPart(constraints.format));
  }

  return parts;
}

function assignStringConstraints(target: StringConstraints, source: StringConstraints) {
  target.minLength = maxNumeric(target.minLength, source.minLength);
  target.maxLength = minNumeric(target.maxLength, source.maxLength);
  target.pattern = target.pattern ?? source.pattern;
  target.format = target.format ?? source.format;
}

interface NumericConstraints {
  min?: number | bigint;
  max?: number | bigint;
  minExclusive?: number | bigint;
  maxExclusive?: number | bigint;
  safe?: boolean;
}

function maxNumeric<T extends number | bigint>(...values: (T | undefined)[]): T | undefined {
  const definedValues = values.filter((v): v is T => v !== undefined);

  if (definedValues.length === 0) {
    return undefined;
  }

  return definedValues.reduce((max, current) => (current > max ? current : max), definedValues[0]);
}

function minNumeric<T extends number | bigint>(...values: (T | undefined)[]): T | undefined {
  const definedValues = values.filter((v): v is T => v !== undefined);

  if (definedValues.length === 0) {
    return undefined;
  }

  return definedValues.reduce((min, current) => (current < min ? current : min), definedValues[0]);
}

/**
 * Return sources from most specific to least specific.
 *
 * Handles lookup types (e.g., `inviteeEmail: User.email`) where the type
 * itself is a ModelProperty. In this case, we need to inherit constraints
 * from the source property.
 */
function getDecoratorSources(
  $: Typekit,
  type: Type,
  member?: ModelProperty,
): (Scalar | ModelProperty)[] {
  const { effectiveType, effectiveMember } = unwrapLookupType($, type, member);
  if (!$.scalar.is(effectiveType)) {
    // Non-scalar, non-ModelProperty type (Model, Union, etc.) - just return member if present
    return effectiveMember ? [effectiveMember] : [];
  }

  const sources: (Scalar | ModelProperty)[] = [
    ...(effectiveMember ? [effectiveMember] : []),
    effectiveType,
  ];

  let currentType: Scalar | undefined = effectiveType.baseScalar;
  while (currentType && !shouldReference($.program, currentType)) {
    sources.push(currentType);
    currentType = currentType.baseScalar;
  }
  return sources;
}

function numericConstraintsParts($: Typekit, type: Scalar, member?: ModelProperty) {
  const finalConstraints: NumericConstraints = {
    min: undefined,
    minExclusive: undefined,
    max: undefined,
    maxExclusive: undefined,
  };

  const sources = getDecoratorSources($, type, member);
  const intrinsicConstraints = intrinsicNumericConstraints($, type);
  const decoratorConstraints = decoratorNumericConstraints($, sources);

  resolveOverlappingNumericBounds(decoratorConstraints, intrinsicConstraints);
  assignNumericConstraints(finalConstraints, intrinsicConstraints);
  assignNumericConstraints(finalConstraints, decoratorConstraints);

  return numericConstraintsToParts(finalConstraints);
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

function zodNumericConstraintName(name: string) {
  if (name === "min") {
    return "gte";
  } else if (name === "max") {
    return "lte";
  } else if (name === "minExclusive") {
    return "gt";
  } else if (name === "maxExclusive") {
    return "lt";
  } else {
    throw new Error(`Unknown constraint name: ${name}`);
  }
}

function intrinsicNumericConstraints($: Typekit, type: Scalar): NumericConstraints {
  const knownType = $.scalar.getStdBase(type);
  if (!knownType) {
    return {};
  }
  if (!$.scalar.extendsNumeric(knownType)) {
    return {};
  }
  if ($.scalar.extendsSafeint(knownType)) {
    return {
      safe: true,
    };
  }
  // Don't emit intrinsic bounds (min/max) - only emit decorator constraints
  return {};
}

function decoratorNumericConstraints($: Typekit, sources: Type[]) {
  const finalConstraints: NumericConstraints = {};
  for (const source of sources) {
    const decoratorConstraints: NumericConstraints = {
      max: $.type.maxValue(source),
      maxExclusive: $.type.maxValueExclusive(source),
      min: $.type.minValue(source),
      minExclusive: $.type.minValueExclusive(source),
    };

    assignNumericConstraints(finalConstraints, decoratorConstraints);
  }

  return finalConstraints;
}

function assignNumericConstraints(target: NumericConstraints, source: NumericConstraints) {
  target.min = maxNumeric(target.min, source.min);
  target.max = minNumeric(target.max, source.max);
  target.minExclusive = maxNumeric(source.minExclusive, target.minExclusive);
  target.maxExclusive = minNumeric(source.maxExclusive, target.maxExclusive);
  target.safe = target.safe ?? source.safe;
}

function unwrapLookupType(
  $: Typekit,
  type: Type,
  member?: ModelProperty,
): { effectiveType: Type; effectiveMember?: ModelProperty } {
  if (!$.modelProperty.is(type)) {
    return { effectiveType: type, effectiveMember: member };
  }

  const sourceProperty = type as ModelProperty;
  let targetType = sourceProperty.type;
  while ($.modelProperty.is(targetType)) {
    targetType = (targetType as ModelProperty).type;
  }

  return { effectiveType: targetType, effectiveMember: sourceProperty };
}

function isEncodedNumericScalar($: Typekit, type: Type): type is Scalar {
  return (
    $.scalar.extendsUtcDateTime(type) ||
    $.scalar.extendsOffsetDateTime(type) ||
    $.scalar.extendsDuration(type)
  );
}

function encodedNumericConstraints($: Typekit, type: Scalar): Children[] {
  const encoding = $.scalar.getEncoding(type);
  return encoding ? numericConstraintsToParts(intrinsicNumericConstraints($, encoding.type)) : [];
}

function resolveOverlappingNumericBounds(
  decoratorConstraints: NumericConstraints,
  intrinsicConstraints: NumericConstraints,
): void {
  resolveDecoratorBounds(decoratorConstraints);
  resolveIntrinsicBound("min", intrinsicConstraints, decoratorConstraints);
  resolveIntrinsicBound("max", intrinsicConstraints, decoratorConstraints);
}

function resolveDecoratorBounds(constraints: NumericConstraints): void {
  if (constraints.min !== undefined && constraints.minExclusive !== undefined) {
    if (constraints.minExclusive > constraints.min) {
      delete constraints.min;
    } else {
      delete constraints.minExclusive;
    }
  }

  if (constraints.max !== undefined && constraints.maxExclusive !== undefined) {
    if (constraints.maxExclusive < constraints.max) {
      delete constraints.max;
    } else {
      delete constraints.maxExclusive;
    }
  }
}

function resolveIntrinsicBound(
  bound: "min" | "max",
  intrinsicConstraints: NumericConstraints,
  decoratorConstraints: NumericConstraints,
): void {
  const intrinsicValue = intrinsicConstraints[bound];
  if (intrinsicValue === undefined) {
    return;
  }

  const decoratorValue = decoratorConstraints[bound];
  const exclusiveKey = bound === "min" ? "minExclusive" : "maxExclusive";
  const exclusiveValue = decoratorConstraints[exclusiveKey];
  const wins =
    bound === "min"
      ? (left: number | bigint, right: number | bigint) => left > right
      : (left: number | bigint, right: number | bigint) => left < right;

  if (decoratorValue !== undefined) {
    if (wins(intrinsicValue, decoratorValue)) {
      delete decoratorConstraints[bound];
    } else {
      delete intrinsicConstraints[bound];
    }
    return;
  }

  if (exclusiveValue !== undefined) {
    if (wins(intrinsicValue, exclusiveValue)) {
      delete decoratorConstraints[exclusiveKey];
    } else {
      delete intrinsicConstraints[bound];
    }
  }
}

interface ArrayConstraints {
  minItems?: number;
  maxItems?: number;
}

function arrayConstraints($: Typekit, type: Type, member?: ModelProperty) {
  // Handle lookup types: when type is a ModelProperty (e.g., User.emails),
  // unwrap it to get the underlying array type
  let effectiveType = type;
  let effectiveMember = member;

  if ($.modelProperty.is(type)) {
    const sourceProperty = type as ModelProperty;
    effectiveMember = sourceProperty;
    let targetType = sourceProperty.type;
    while ($.modelProperty.is(targetType)) {
      targetType = (targetType as ModelProperty).type;
    }
    effectiveType = targetType;
  }

  const constraints: ArrayConstraints = {
    minItems: $.type.minItems(effectiveType),
    maxItems: $.type.maxItems(effectiveType),
  };
  const memberConstraints: ArrayConstraints = {
    minItems: effectiveMember && $.type.minItems(effectiveMember),
    maxItems: effectiveMember && $.type.maxItems(effectiveMember),
  };

  assignArrayConstraints(constraints, memberConstraints);

  const parts = [];

  if (constraints.minItems && constraints.minItems > 0) {
    parts.push(callPart("min", constraints.minItems));
  }

  if (constraints.maxItems && constraints.maxItems > 0) {
    parts.push(callPart("max", constraints.maxItems));
  }

  return parts;
}

function assignArrayConstraints(target: ArrayConstraints, source: ArrayConstraints) {
  target.minItems = maxNumeric(target.minItems, source.minItems);
  target.maxItems = minNumeric(target.maxItems, source.maxItems);
}
