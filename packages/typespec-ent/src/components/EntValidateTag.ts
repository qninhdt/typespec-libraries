/**
 * EntValidateTag -builds go-playground/validator v10 validate tag strings.
 * Pure logic, no JSX -returns a string tag value.
 */

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
  getOrmScalarName,
  getPattern,
  getPropertyEnum,
  isArrayType,
  isAutoCreateTime,
  isAutoUpdateTime,
  isCustomScalar,
  isKey,
  isSoftDelete,
  resolveDbType,
} from "@qninhdt/typespec-orm";
import { GO_NATIVE_VALIDATORS } from "./EntConstants.js";

/**
 * Build a validate tag string for a property.
 * Uses gte/lte for numeric bounds (not min/max which are for string length).
 */
export function buildValidateTag(program: Program, prop: ModelProperty): string {
  const parts: string[] = [];
  const dbType = resolveDbType(prop.type);
  const isOptional = prop.optional;
  const isPk = isKey(program, prop);
  const isSoft = isSoftDelete(program, prop);

  if (isOptional) parts.push("omitempty");

  const isBoolType = dbType === "boolean";
  const isScalarType = dbType !== undefined && !isArrayType(prop.type);
  const isAutoTimestamp = isAutoCreateTime(program, prop) || isAutoUpdateTime(program, prop);
  const customScalar =
    prop.type.kind === "Scalar" && isCustomScalar(program, prop.type) ? prop.type : undefined;
  const semanticScalarName = customScalar ? getOrmScalarName(customScalar) : undefined;
  const nativeValidator = semanticScalarName
    ? GO_NATIVE_VALIDATORS[semanticScalarName]
    : customScalar
      ? GO_NATIVE_VALIDATORS[customScalar.name]
      : undefined;
  const useDirectPropertyConstraints = customScalar !== undefined;

  // Primary keys, soft deletes, and auto-timestamps are auto-managed
  if (isPk || isSoft || isAutoTimestamp) {
    return parts.length > 0 ? parts.join(",") : "";
  }

  // Required for non-optional scalars (except booleans)
  if (!isOptional && isScalarType && !isBoolType) {
    parts.push("required");
  }

  appendLengthValidators(parts, program, prop, useDirectPropertyConstraints);
  appendValueValidators(parts, program, prop, useDirectPropertyConstraints);

  if (isArrayType(prop.type)) {
    appendArrayValidators(parts, program, prop);
  }

  // Pattern (regex)
  const pattern = useDirectPropertyConstraints
    ? tsGetPattern(program, prop)
    : getPattern(program, prop);
  if (pattern) {
    parts.push(`regexp=${pattern}`);
  }

  // Custom scalar validators
  if (customScalar) {
    if (nativeValidator) {
      parts.push(nativeValidator);
    } else {
      // No native go-playground/validator — fall back to scalar decorators
      appendScalarFallbackValidators(parts, program, customScalar, {
        hasPattern: pattern !== undefined,
        hasMaxLength: hasDirectMaxLength(program, prop),
        hasMinLength: hasDirectMinLength(program, prop),
        hasMaxValue: hasDirectMaxValue(program, prop),
        hasMinValue: hasDirectMinValue(program, prop),
      });
    }
  }

  // Enum validation
  const enumInfo = getPropertyEnum(prop);
  if (enumInfo) {
    const values = enumInfo.members.map((m) => formatOneOfValue(m.value)).join(" ");
    parts.push(`oneof=${values}`);
  }

  return parts.length > 0 ? parts.join(",") : "";
}

function formatOneOfValue(value: string): string {
  const escaped = value.replaceAll(",", "0x2C").replaceAll("|", "0x7C");
  return /\s/.test(escaped) ? `'${escaped.replaceAll("'", "\\'")}'` : escaped;
}

function appendLengthValidators(
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

function appendValueValidators(
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

function appendArrayValidators(parts: string[], program: Program, prop: ModelProperty): void {
  const minItems = getMinItems(program, prop);
  if (minItems !== undefined) {
    parts.push(`min=${minItems}`);
  }

  const maxItems = getMaxItems(program, prop);
  if (maxItems !== undefined) {
    parts.push(`max=${maxItems}`);
  }
}

function appendScalarFallbackValidators(
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

function hasDirectMaxLength(program: Program, prop: ModelProperty): boolean {
  return tsGetMaxLength(program, prop) !== undefined;
}

function hasDirectMinLength(program: Program, prop: ModelProperty): boolean {
  return tsGetMinLength(program, prop) !== undefined;
}

function hasDirectMaxValue(program: Program, prop: ModelProperty): boolean {
  return tsGetMaxValue(program, prop) !== undefined;
}

function hasDirectMinValue(program: Program, prop: ModelProperty): boolean {
  return tsGetMinValue(program, prop) !== undefined;
}
