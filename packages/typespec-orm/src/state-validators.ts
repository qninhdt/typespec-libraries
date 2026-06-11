import type { ModelProperty, Program, Scalar } from "@typespec/compiler";
import {
  getMaxItems as tsGetMaxItems,
  getMaxValueExclusive as tsGetMaxValueExclusive,
  getMaxLength as tsGetMaxLength,
  getMaxValue as tsGetMaxValue,
  getMinItems as tsGetMinItems,
  getMinValueExclusive as tsGetMinValueExclusive,
  getMinLength as tsGetMinLength,
  getMinValue as tsGetMinValue,
  getPattern as tsGetPattern,
  isKey as tsIsKey,
} from "@typespec/compiler";
import { AutoCreateTimeKey, AutoUpdateTimeKey, PrecisionKey } from "./lib.js";
import { getCustomScalarName, withLookupFallback } from "./scalar-resolution.js";

/** Primary key check (TypeSpec built-in `@key`). */
export function isKey(program: Program, prop: ModelProperty): boolean {
  return tsIsKey(program, prop);
}

export const getMaxValueExclusive = withLookupFallback(tsGetMaxValueExclusive);
export const getMinValueExclusive = withLookupFallback(tsGetMinValueExclusive);
export const getMaxItems = withLookupFallback(tsGetMaxItems);
export const getMinItems = withLookupFallback(tsGetMinItems);
export const getMaxLength = withLookupFallback(tsGetMaxLength);
export const getMinLength = withLookupFallback(tsGetMinLength);
export const getMinValue = withLookupFallback(tsGetMinValue);
export const getMaxValue = withLookupFallback(tsGetMaxValue);
export const getPattern = withLookupFallback(tsGetPattern);

export interface ValidatorInfo {
  name: string;
  args?: string;
}

/**
 * Collect all validators for a property.
 * Returns an array of ValidatorInfo objects with name and optional args.
 */
export function getValidators(program: Program, prop: ModelProperty): ValidatorInfo[] {
  const validators: ValidatorInfo[] = [];
  const validatorEntries: Array<[string, unknown]> = [
    ["maxLength", getMaxLength(program, prop)],
    ["minLength", getMinLength(program, prop)],
    ["maxValue", getMaxValue(program, prop)],
    ["minValue", getMinValue(program, prop)],
    ["maxValueExclusive", getMaxValueExclusive(program, prop)],
    ["minValueExclusive", getMinValueExclusive(program, prop)],
    ["maxItems", getMaxItems(program, prop)],
    ["minItems", getMinItems(program, prop)],
  ];
  for (const [name, value] of validatorEntries) {
    if (value !== undefined) {
      validators.push({
        name,
        args: typeof value === "object" ? JSON.stringify(value) : `${value}`,
      });
    }
  }

  const pattern = getPattern(program, prop);
  if (pattern) validators.push({ name: "pattern", args: pattern });

  const customScalarName = getCustomScalarName(prop.type);
  if (customScalarName) validators.push({ name: "customScalar", args: customScalarName });

  return validators;
}

export function isAutoCreateTime(program: Program, prop: ModelProperty): boolean {
  return program.stateMap(AutoCreateTimeKey).has(prop);
}

export function isAutoUpdateTime(program: Program, prop: ModelProperty): boolean {
  return program.stateMap(AutoUpdateTimeKey).has(prop);
}

export interface PrecisionInfo {
  precision: number;
  scale: number;
}

export function getPrecision(program: Program, prop: ModelProperty): PrecisionInfo | undefined {
  return program.stateMap(PrecisionKey).get(prop) as PrecisionInfo | undefined;
}

// re-export scalar-related helpers needed by validators
export type { Scalar };
