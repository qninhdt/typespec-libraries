/**
 * Shared helpers for zod constraint resolution.
 *
 * Common types and utilities used by numeric, string, and array
 * constraint resolvers.
 */

import { ModelProperty, Scalar, Type } from "@typespec/compiler";
import { Typekit } from "@typespec/compiler/typekit";
import { shouldReference } from "./utils.js";

export type NumericValue = number | bigint;
export type OptionalNumericValue = NumericValue | undefined;

export function unwrapLookupType(
  $: Typekit,
  type: Type,
  member?: ModelProperty,
): { effectiveType: Type; effectiveMember?: ModelProperty } {
  if (!$.modelProperty.is(type)) {
    return { effectiveType: type, effectiveMember: member };
  }

  const sourceProperty = type;
  let targetType = sourceProperty.type;
  while ($.modelProperty.is(targetType)) {
    targetType = targetType.type;
  }

  return { effectiveType: targetType, effectiveMember: sourceProperty };
}

/**
 * Return decorator sources from most specific to least specific.
 *
 * Handles lookup types (e.g., `inviteeEmail: User.email`) where the type
 * itself is a ModelProperty. In this case, we need to inherit constraints
 * from the source property.
 */
export function getDecoratorSources(
  $: Typekit,
  type: Type,
  member?: ModelProperty,
): (Scalar | ModelProperty)[] {
  const { effectiveType, effectiveMember } = unwrapLookupType($, type, member);
  if (!$.scalar.is(effectiveType)) {
    return effectiveMember ? [effectiveMember] : [];
  }

  // When the scalar is referenced as a separate declaration, its constraints
  // are already in that declaration. Only include member-level (property)
  // overrides.
  if (effectiveMember && shouldReference($.program, effectiveType)) {
    return [effectiveMember];
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

export function maxNumeric(...values: (number | undefined)[]): number | undefined;
export function maxNumeric(...values: (bigint | undefined)[]): bigint | undefined;
export function maxNumeric(...values: OptionalNumericValue[]): OptionalNumericValue;
export function maxNumeric(...values: OptionalNumericValue[]): OptionalNumericValue {
  const defined = values.filter((v): v is NumericValue => v !== undefined);
  if (defined.length === 0) return undefined;

  if (typeof defined[0] === "bigint") {
    let current = defined[0] as bigint;
    for (let i = 1; i < defined.length; i++) {
      const v = defined[i];
      if (typeof v === "bigint" && v > current) current = v;
    }
    return current;
  }

  let current = defined[0] as number;
  for (let i = 1; i < defined.length; i++) {
    const v = defined[i];
    if (typeof v === "number" && v > current) current = v;
  }
  return current;
}

export function minNumeric(...values: (number | undefined)[]): number | undefined;
export function minNumeric(...values: (bigint | undefined)[]): bigint | undefined;
export function minNumeric(...values: OptionalNumericValue[]): OptionalNumericValue;
export function minNumeric(...values: OptionalNumericValue[]): OptionalNumericValue {
  const defined = values.filter((v): v is NumericValue => v !== undefined);
  if (defined.length === 0) return undefined;

  if (typeof defined[0] === "bigint") {
    let current = defined[0] as bigint;
    for (let i = 1; i < defined.length; i++) {
      const v = defined[i];
      if (typeof v === "bigint" && v < current) current = v;
    }
    return current;
  }

  let current = defined[0] as number;
  for (let i = 1; i < defined.length; i++) {
    const v = defined[i];
    if (typeof v === "number" && v < current) current = v;
  }
  return current;
}
