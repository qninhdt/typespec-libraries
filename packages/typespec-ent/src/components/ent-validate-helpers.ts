import {
  getMaxLength as tsGetMaxLength,
  getMaxValueExclusive as tsGetMaxValueExclusive,
  getMaxValue as tsGetMaxValue,
  getMinLength as tsGetMinLength,
  getMinValueExclusive as tsGetMinValueExclusive,
  getMinValue as tsGetMinValue,
  getPattern as tsGetPattern,
  type ModelProperty,
  type Program,
  type Scalar,
} from "@typespec/compiler";
import {
  getMaxItems,
  getMaxLength,
  getMaxValue,
  getMaxValueExclusive,
  getMinItems,
  getMinLength,
  getMinValue,
  getMinValueExclusive,
  getPattern,
} from "@qninhdt/typespec-orm";

/** Append `max=` / `min=` length validators (string-length semantics). */
export function appendLengthValidators(
  parts: string[],
  program: Program,
  prop: ModelProperty,
  useDirectPropertyConstraints: boolean,
): void {
  const maxLen = useDirectPropertyConstraints
    ? tsGetMaxLength(program, prop)
    : getMaxLength(program, prop);
  if (maxLen !== undefined) {
    parts.push(`max=${maxLen}`);
  }

  const minLen = useDirectPropertyConstraints
    ? tsGetMinLength(program, prop)
    : getMinLength(program, prop);
  if (minLen !== undefined) {
    parts.push(`min=${minLen}`);
  }
}

/** Append `lt`/`lte`/`gt`/`gte` numeric range validators. */
export function appendValueValidators(
  parts: string[],
  program: Program,
  prop: ModelProperty,
  useDirectPropertyConstraints: boolean,
): void {
  const maxVal = useDirectPropertyConstraints
    ? tsGetMaxValue(program, prop)
    : getMaxValue(program, prop);
  const minVal = useDirectPropertyConstraints
    ? tsGetMinValue(program, prop)
    : getMinValue(program, prop);
  const maxValExclusive = useDirectPropertyConstraints
    ? tsGetMaxValueExclusive(program, prop)
    : getMaxValueExclusive(program, prop);
  const minValExclusive = useDirectPropertyConstraints
    ? tsGetMinValueExclusive(program, prop)
    : getMinValueExclusive(program, prop);

  if (maxValExclusive !== undefined) {
    parts.push(`lt=${maxValExclusive}`);
  } else if (maxVal !== undefined) {
    parts.push(`lte=${maxVal}`);
  }

  if (minValExclusive !== undefined) {
    parts.push(`gt=${minValExclusive}`);
  } else if (minVal !== undefined) {
    parts.push(`gte=${minVal}`);
  }
}

/** Append `min=`/`max=` validators for array length (item-count semantics). */
export function appendArrayValidators(
  parts: string[],
  program: Program,
  prop: ModelProperty,
): void {
  const minItems = getMinItems(program, prop);
  if (minItems !== undefined) {
    parts.push(`min=${minItems}`);
  }

  const maxItems = getMaxItems(program, prop);
  if (maxItems !== undefined) {
    parts.push(`max=${maxItems}`);
  }
}

/**
 * Walk a custom scalar's `extends` chain, lifting any constraints not already
 * present on the property itself into validator tags. Used when the scalar has
 * no native go-playground/validator equivalent.
 */
export function appendScalarFallbackValidators(
  parts: string[],
  program: Program,
  scalar: Scalar,
  direct: {
    hasPattern: boolean;
    hasMaxLength: boolean;
    hasMinLength: boolean;
    hasMaxValue: boolean;
    hasMinValue: boolean;
  },
): void {
  let current: Scalar | undefined = scalar;
  let hasPattern = direct.hasPattern;
  let hasMaxLength = direct.hasMaxLength;
  let hasMinLength = direct.hasMinLength;
  let hasMaxValue = direct.hasMaxValue;
  let hasMinValue = direct.hasMinValue;
  while (current) {
    const pattern = tsGetPattern(program, current);
    if (pattern && !hasPattern) {
      parts.push(`regexp=${pattern}`);
      hasPattern = true;
    }
    const maxLen = tsGetMaxLength(program, current);
    if (maxLen !== undefined && !hasMaxLength) {
      parts.push(`max=${maxLen}`);
      hasMaxLength = true;
    }
    const minLen = tsGetMinLength(program, current);
    if (minLen !== undefined && !hasMinLength) {
      parts.push(`min=${minLen}`);
      hasMinLength = true;
    }
    const maxVal = tsGetMaxValue(program, current);
    if (maxVal !== undefined && !hasMaxValue) {
      parts.push(`lte=${maxVal}`);
      hasMaxValue = true;
    }
    const minVal = tsGetMinValue(program, current);
    if (minVal !== undefined && !hasMinValue) {
      parts.push(`gte=${minVal}`);
      hasMinValue = true;
    }
    if (hasPattern && hasMaxLength && hasMinLength && hasMaxValue && hasMinValue) {
      return;
    }
    current = current.baseScalar;
  }
}

/** Resolve the property-level pattern decorator (custom-scalar aware). */
export function resolvePropertyPattern(
  program: Program,
  prop: ModelProperty,
  useDirectPropertyConstraints: boolean,
): string | undefined {
  return useDirectPropertyConstraints ? tsGetPattern(program, prop) : getPattern(program, prop);
}

/** Format a single `oneof=` enum value, escaping `,`/`|` and quoting whitespace. */
export function formatOneOfValue(value: string): string {
  const escaped = value.replaceAll(",", "0x2C").replaceAll("|", "0x7C");
  return /\s/.test(escaped) ? `'${escaped.replaceAll("'", "\\'")}'` : escaped;
}

export function hasDirectMaxLength(program: Program, prop: ModelProperty): boolean {
  return tsGetMaxLength(program, prop) !== undefined;
}

export function hasDirectMinLength(program: Program, prop: ModelProperty): boolean {
  return tsGetMinLength(program, prop) !== undefined;
}

export function hasDirectMaxValue(program: Program, prop: ModelProperty): boolean {
  return tsGetMaxValue(program, prop) !== undefined;
}

export function hasDirectMinValue(program: Program, prop: ModelProperty): boolean {
  return tsGetMinValue(program, prop) !== undefined;
}
