/**
 * Zod constraints dispatcher. Routes a TypeSpec type to its constraint
 * resolver (numeric/string/array/encoded) and returns the corresponding
 * Zod schema parts.
 */

import { Children } from "@alloy-js/core/jsx-runtime";
import { ModelProperty, Type } from "@typespec/compiler";
import { useTsp } from "@typespec/emitter-framework";
import { unwrapLookupType } from "./constraints-utils.js";
import {
  encodedNumericConstraints,
  isEncodedNumericScalar,
  numericConstraintsParts,
} from "./constraints-numeric.js";
import { stringConstraintsParts } from "./constraints-string.js";
import { arrayConstraintsParts } from "./constraints-array.js";

export function zodConstraintsParts(type: Type, member?: ModelProperty): Children[] {
  const { $ } = useTsp();
  const { effectiveType, effectiveMember } = unwrapLookupType($, type, member);

  if ($.scalar.extendsNumeric(effectiveType)) {
    return numericConstraintsParts($, effectiveType, effectiveMember);
  }

  if ($.scalar.extendsString(effectiveType)) {
    return stringConstraintsParts($, effectiveType, effectiveMember);
  }

  if (isEncodedNumericScalar($, effectiveType)) {
    return encodedNumericConstraints($, effectiveType);
  }

  if ($.array.is(effectiveType)) {
    return arrayConstraintsParts($, effectiveType, effectiveMember);
  }

  return [];
}
