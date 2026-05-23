/**
 * EntValidateTag -builds go-playground/validator v10 validate tag strings.
 * Pure logic, no JSX -returns a string tag value.
 */

import { type ModelProperty, type Program } from "@typespec/compiler";
import {
  getOrmScalarName,
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
import {
  appendArrayValidators,
  appendLengthValidators,
  appendScalarFallbackValidators,
  appendValueValidators,
  formatOneOfValue,
  hasDirectMaxLength,
  hasDirectMaxValue,
  hasDirectMinLength,
  hasDirectMinValue,
  resolvePropertyPattern,
} from "./ent-validate-helpers.js";

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
  const pattern = resolvePropertyPattern(program, prop, useDirectPropertyConstraints);
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
