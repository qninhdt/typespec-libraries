/**
 * GormValidateTag -builds go-playground/validator v10 validate tag strings.
 * Pure logic, no JSX -returns a string tag value.
 */

import type { ModelProperty, Program } from "@typespec/compiler";
import {
  getFormat,
  getMaxLength,
  getMaxValue,
  getMinLength,
  getMinValue,
  getPattern,
  getPropertyEnum,
  isAutoCreateTime,
  isAutoUpdateTime,
  isId,
  isSoftDelete,
  resolveDbType,
  NUMERIC_TYPES,
} from "@qninhdt/typespec-orm";
import { reportDiagnostic } from "../lib.js";
import { GO_FORMAT_VALIDATORS } from "./GormConstants.js";

/**
 * Build a validate tag string for a property.
 * Uses gte/lte for numeric bounds (not min/max which are for string length).
 */
export function buildValidateTag(program: Program, prop: ModelProperty): string {
  const parts: string[] = [];
  const dbType = resolveDbType(prop.type);
  const isOptional = prop.optional;
  const isPk = isId(program, prop);
  const isSoft = isSoftDelete(program, prop);

  if (isOptional) parts.push("omitempty");

  const isBoolType = dbType === "boolean";
  const isNumericForRequired = dbType !== undefined && NUMERIC_TYPES.has(dbType);
  const isAutoTimestamp = isAutoCreateTime(program, prop) || isAutoUpdateTime(program, prop);
  if (!isOptional && !isPk && !isSoft && !isBoolType && !isNumericForRequired && !isAutoTimestamp) {
    parts.push("required");
  }

  const enumInfo = getPropertyEnum(prop);
  if (enumInfo) {
    const values = enumInfo.members.map((m) => m.value).join(" ");
    parts.push(`oneof=${values}`);
    return parts.join(",");
  }

  const isStringType = dbType === "string" || dbType === "text" || dbType === "uuid";
  if (isStringType || dbType === undefined) {
    const minLen = getMinLength(program, prop);
    const maxLen = getMaxLength(program, prop);
    if (minLen !== undefined) parts.push(`min=${minLen}`);
    if (maxLen !== undefined) parts.push(`max=${maxLen}`);
  }

  const isNumericType = dbType !== undefined && NUMERIC_TYPES.has(dbType);
  if (isNumericType) {
    const minVal = getMinValue(program, prop);
    const maxVal = getMaxValue(program, prop);
    if (minVal !== undefined) parts.push(`gte=${minVal}`);
    if (maxVal !== undefined) parts.push(`lte=${maxVal}`);
  }

  const format = getFormat(program, prop);
  if (format) {
    const validator = GO_FORMAT_VALIDATORS[format];
    if (validator) {
      parts.push(validator);
    } else {
      reportDiagnostic(program, {
        code: "unknown-format",
        target: prop,
        format: { format, propName: prop.name },
      });
    }
  }

  const pattern = getPattern(program, prop);
  if (pattern) parts.push(`regexp=${pattern}`);

  if (parts.length === 1 && parts[0] === "omitempty") return "";

  return parts.join(",");
}
