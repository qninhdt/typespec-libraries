/**
 * Shared property-constraint resolver used by PyField and PyDataModel.
 *
 * When `useDirect` is true, constraints are read with raw TypeSpec getters so
 * that constraints inherited from the scalar definition (already represented
 * by the alias / native pydantic type) are NOT duplicated on the property.
 */

import {
  getMaxLength as tsGetMaxLength,
  getMaxValue as tsGetMaxValue,
  getMaxValueExclusive as tsGetMaxValueExclusive,
  getMinLength as tsGetMinLength,
  getMinValue as tsGetMinValue,
  getMinValueExclusive as tsGetMinValueExclusive,
  getPattern as tsGetPattern,
  type ModelProperty,
  type Program,
} from "@typespec/compiler";
import {
  getMaxLength,
  getMaxValue,
  getMaxValueExclusive,
  getMinLength,
  getMinValue,
  getMinValueExclusive,
  getPattern,
} from "@qninhdt/typespec-orm";

export interface EffectivePropertyConstraints {
  maxLen: number | undefined;
  minLen: number | undefined;
  minVal: number | undefined;
  maxVal: number | undefined;
  minValExcl: number | undefined;
  maxValExcl: number | undefined;
  pattern: string | undefined;
}

export interface GetEffectivePropertyConstraintsOptions {
  /**
   * When true, read constraints directly from the property only (raw TypeSpec
   * getters). Use this when the field's scalar already encodes its
   * constraints elsewhere (alias module or native pydantic type).
   */
  useDirect: boolean;
}

export function getEffectivePropertyConstraints(
  program: Program,
  prop: ModelProperty,
  { useDirect }: GetEffectivePropertyConstraintsOptions,
): EffectivePropertyConstraints {
  return {
    maxLen: useDirect ? tsGetMaxLength(program, prop) : getMaxLength(program, prop),
    minLen: useDirect ? tsGetMinLength(program, prop) : getMinLength(program, prop),
    minVal: useDirect ? tsGetMinValue(program, prop) : getMinValue(program, prop),
    maxVal: useDirect ? tsGetMaxValue(program, prop) : getMaxValue(program, prop),
    minValExcl: useDirect
      ? tsGetMinValueExclusive(program, prop)
      : getMinValueExclusive(program, prop),
    maxValExcl: useDirect
      ? tsGetMaxValueExclusive(program, prop)
      : getMaxValueExclusive(program, prop),
    pattern: useDirect ? tsGetPattern(program, prop) : getPattern(program, prop),
  };
}
