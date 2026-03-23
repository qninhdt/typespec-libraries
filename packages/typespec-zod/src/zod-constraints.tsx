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

  // Handle lookup types: when type is a ModelProperty (e.g., User.email),
  // unwrap it to get the underlying scalar type
  let effectiveType = type;
  let effectiveMember = member;

  if ($.modelProperty.is(type)) {
    const sourceProperty = type as ModelProperty;
    // For lookup types, the member becomes the source property
    effectiveMember = sourceProperty;
    // Get the underlying type (follow the chain for nested lookups)
    let targetType = sourceProperty.type;
    while ($.modelProperty.is(targetType)) {
      targetType = (targetType as ModelProperty).type;
    }
    effectiveType = targetType;
  }

  let constraintParts: Children[] = [];
  if ($.scalar.extendsNumeric(effectiveType)) {
    constraintParts = numericConstraintsParts($, effectiveType, effectiveMember);
  } else if ($.scalar.extendsString(effectiveType)) {
    constraintParts = stringConstraints($, effectiveType, effectiveMember);
  } else if (
    $.scalar.extendsUtcDateTime(effectiveType) ||
    $.scalar.extendsOffsetDateTime(effectiveType) ||
    $.scalar.extendsDuration(effectiveType)
  ) {
    const encoding = $.scalar.getEncoding(effectiveType);
    if (encoding === undefined) {
      constraintParts = [];
    } else {
      constraintParts = numericConstraintsToParts(intrinsicNumericConstraints($, encoding.type));
    }
  } else if ($.array.is(effectiveType)) {
    constraintParts = arrayConstraints($, effectiveType, effectiveMember);
  }

  return constraintParts;
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
  for (const source of sources.reverse()) {
    const decoratorConstraints: StringConstraints = {
      minLength: $.type.minLength(source),
      maxLength: $.type.maxLength(source),
      pattern: getPattern($.program, source),
      format: getFormat($.program, source),
    };

    assignStringConstraints(constraints, decoratorConstraints);
  }

  const parts: Children[] = [];

  for (const [name, value] of Object.entries(constraints)) {
    if (value === undefined) {
      continue;
    }
    if (name === "minLength" && value !== 0) {
      parts.push(callPart("min", value));
    } else if (name === "maxLength" && isFinite(value)) {
      parts.push(callPart("max", value));
    } else if (name === "pattern") {
      parts.push(callPart("regex", `/${value}/`));
    } else if (name === "format") {
      parts.push(callPart(value));
    }
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
  // Handle lookup types: when type is a ModelProperty (e.g., User.email),
  // the actual scalar type is in type.type
  if ($.modelProperty.is(type)) {
    const sourceProperty = type as ModelProperty;
    const scalarType = sourceProperty.type;

    // If the source property points to another ModelProperty (chained lookup),
    // follow the chain to find the ultimate scalar
    let targetType = scalarType;
    while ($.modelProperty.is(targetType)) {
      targetType = (targetType as ModelProperty).type;
    }

    // If it's a scalar, get constraints from both the source property and the scalar
    if ($.scalar.is(targetType)) {
      const sources: (Scalar | ModelProperty)[] = [...(member ? [member] : []), sourceProperty];
      let currentType: Scalar | undefined = targetType as Scalar;
      while (currentType && !shouldReference($.program, currentType)) {
        sources.push(currentType);
        currentType = currentType.baseScalar;
      }
      return sources;
    }

    // For non-scalar types (like Model references), just use the source property
    return [...(member ? [member] : []), sourceProperty];
  }

  if (!$.scalar.is(type)) {
    // Non-scalar type (Model, Union, etc.) - just return member and type as-is
    const result: (Scalar | ModelProperty)[] = member ? [member] : [];
    if ($.modelProperty.is(type)) {
      result.push(type as ModelProperty);
    }
    return result;
  }

  const sources: (Scalar | ModelProperty)[] = [...(member ? [member] : []), type];

  let currentType: Scalar | undefined = type.baseScalar;
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

  if (decoratorConstraints.min !== undefined && decoratorConstraints.minExclusive !== undefined) {
    if (decoratorConstraints.minExclusive > decoratorConstraints.min) {
      delete decoratorConstraints.min;
    } else {
      delete decoratorConstraints.minExclusive;
    }
  }

  if (decoratorConstraints.max !== undefined && decoratorConstraints.maxExclusive !== undefined) {
    if (decoratorConstraints.maxExclusive < decoratorConstraints.max) {
      delete decoratorConstraints.max;
    } else {
      delete decoratorConstraints.maxExclusive;
    }
  }

  if (intrinsicConstraints.min !== undefined) {
    if (decoratorConstraints.min !== undefined) {
      if (intrinsicConstraints.min > decoratorConstraints.min) {
        delete decoratorConstraints.min;
      } else {
        delete intrinsicConstraints.min;
      }
    } else if (decoratorConstraints.minExclusive !== undefined) {
      if (intrinsicConstraints.min! > decoratorConstraints.minExclusive) {
        delete decoratorConstraints.minExclusive;
      } else {
        delete intrinsicConstraints.min;
      }
    }
  }

  if (intrinsicConstraints.max !== undefined) {
    if (decoratorConstraints.max !== undefined) {
      if (intrinsicConstraints.max < decoratorConstraints.max) {
        delete decoratorConstraints.max;
      } else {
        delete intrinsicConstraints.max;
      }
    } else if (decoratorConstraints.maxExclusive !== undefined) {
      if (intrinsicConstraints.max! < decoratorConstraints.maxExclusive) {
        delete decoratorConstraints.maxExclusive;
      } else {
        delete intrinsicConstraints.max;
      }
    }
  }
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
  } else if ($.scalar.extendsSafeint(knownType)) {
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
