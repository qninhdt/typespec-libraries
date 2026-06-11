/**
 * Array constraint resolution. Resolves @minItems/@maxItems on the array
 * type and the owning property, then emits z.min()/z.max() parts.
 */

import { Children } from "@alloy-js/core/jsx-runtime";
import { ModelProperty, Type } from "@typespec/compiler";
import { Typekit } from "@typespec/compiler/typekit";
import { callPart } from "./utils.js";
import { maxNumeric, minNumeric, unwrapLookupType } from "./constraints-utils.js";

interface ArrayConstraints {
  minItems?: number;
  maxItems?: number;
}

export function arrayConstraintsParts($: Typekit, type: Type, member?: ModelProperty): Children[] {
  const { effectiveType, effectiveMember } = unwrapLookupType($, type, member);

  const constraints: ArrayConstraints = {
    minItems: $.type.minItems(effectiveType),
    maxItems: $.type.maxItems(effectiveType),
  };

  if (effectiveMember) {
    assignArrayConstraints(constraints, {
      minItems: $.type.minItems(effectiveMember),
      maxItems: $.type.maxItems(effectiveMember),
    });
  }

  const parts: Children[] = [];

  if (constraints.minItems && constraints.minItems > 0) {
    parts.push(callPart("min", constraints.minItems));
  }
  if (constraints.maxItems !== undefined) {
    parts.push(callPart("max", constraints.maxItems));
  }

  return parts;
}

function assignArrayConstraints(target: ArrayConstraints, source: ArrayConstraints) {
  target.minItems = maxNumeric(target.minItems, source.minItems);
  target.maxItems = minNumeric(target.maxItems, source.maxItems);
}
