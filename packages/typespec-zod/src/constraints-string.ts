/**
 * String constraint resolution. Resolves @minLength/@maxLength/@pattern
 * from decorators on properties and scalars (and inherited from base
 * scalars), then emits z.min()/z.max()/z.regex() parts.
 *
 * For Zod-native scalars (uuid/email/etc), patterns from the scalar
 * definition itself are skipped because the base validator already
 * applies them.
 */

import { Children } from "@alloy-js/core/jsx-runtime";
import { getPattern, ModelProperty, Scalar } from "@typespec/compiler";
import { Typekit } from "@typespec/compiler/typekit";
import { callPart, ZOD_NATIVE_SCALARS } from "./utils.js";
import { getDecoratorSources, maxNumeric, minNumeric } from "./constraints-utils.js";

interface StringConstraints {
  minLength?: number;
  maxLength?: number;
  pattern?: string;
}

export function stringConstraintsParts(
  $: Typekit,
  type: Scalar,
  member?: ModelProperty,
): Children[] {
  const sources = getDecoratorSources($, type, member);
  const isNativeScalar = ZOD_NATIVE_SCALARS.has(type.name);
  const constraints: StringConstraints = {};

  for (const source of [...sources].reverse()) {
    assignStringConstraints(constraints, {
      minLength: $.type.minLength(source),
      maxLength: $.type.maxLength(source),
      // For native scalars, only take pattern from the member (user-applied),
      // not from the scalar definition itself.
      pattern:
        isNativeScalar && source.kind === "Scalar" ? undefined : getPattern($.program, source),
    });
  }

  const parts: Children[] = [];

  if (constraints.minLength !== undefined && constraints.minLength !== 0) {
    parts.push(callPart("min", constraints.minLength));
  }
  if (constraints.maxLength !== undefined && Number.isFinite(constraints.maxLength)) {
    parts.push(callPart("max", constraints.maxLength));
  }
  if (constraints.pattern !== undefined) {
    parts.push(callPart("regex", `new RegExp(${JSON.stringify(constraints.pattern)})`));
  }

  return parts;
}

function assignStringConstraints(target: StringConstraints, source: StringConstraints) {
  target.minLength = maxNumeric(target.minLength, source.minLength);
  target.maxLength = minNumeric(target.maxLength, source.maxLength);
  target.pattern = target.pattern ?? source.pattern;
}
