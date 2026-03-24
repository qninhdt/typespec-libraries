/**
 * GormValidateTag -builds go-playground/validator v10 validate tag strings.
 * Pure logic, no JSX -returns a string tag value.
 */

import type { ModelProperty, Program } from "@typespec/compiler";
import {
  getFormat,
  getMaxItems,
  getMaxLength,
  getMaxValue,
  getMaxValueExclusive,
  getMinItems,
  getMinLength,
  getMinValue,
  getMinValueExclusive,
  getPattern,
  getPropertyEnum,
  isArrayType,
  isAutoCreateTime,
  isAutoUpdateTime,
  isKey,
  isSoftDelete,
  resolveDbType,
} from "@qninhdt/typespec-orm";
import { GO_FORMAT_VALIDATORS } from "./GormConstants.js";

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

  // Primary keys, soft deletes, and auto-timestamps are auto-managed
  if (isPk || isSoft || isAutoTimestamp) {
    return parts.length > 0 ? parts.join(",") : "";
  }

  // Required for non-optional scalars (except booleans)
  if (!isOptional && isScalarType && !isBoolType) {
    parts.push("required");
  }

  appendLengthValidators(parts, program, prop);
  appendValueValidators(parts, program, prop);

  if (isArrayType(prop.type)) {
    appendArrayValidators(parts, program, prop);
  }

  // Pattern (regex)
  const pattern = getPattern(program, prop);
  if (pattern) {
    parts.push(`regexp=${pattern}`);
  }

  // Format validators
  const format = getFormat(program, prop);
  if (format) {
    const validator = GO_FORMAT_VALIDATORS[format];
    if (validator) {
      parts.push(validator);
    }
  }

  // Enum validation
  const enumInfo = getPropertyEnum(prop);
  if (enumInfo) {
    const values = enumInfo.members.map((m) => m.value).join(",");
    parts.push(`oneof=${values}`);
  }

  return parts.length > 0 ? parts.join(",") : "";
}

function appendLengthValidators(parts: string[], program: Program, prop: ModelProperty): void {
  const maxLen = getMaxLength(program, prop);
  if (maxLen !== undefined) {
    parts.push(`max=${maxLen}`);
  }

  const minLen = getMinLength(program, prop);
  if (minLen !== undefined) {
    parts.push(`min=${minLen}`);
  }
}

function appendValueValidators(parts: string[], program: Program, prop: ModelProperty): void {
  const maxVal = getMaxValue(program, prop);
  const minVal = getMinValue(program, prop);
  const maxValExclusive = getMaxValueExclusive(program, prop);
  const minValExclusive = getMinValueExclusive(program, prop);

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
