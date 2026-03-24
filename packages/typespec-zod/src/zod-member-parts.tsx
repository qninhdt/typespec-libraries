/**
 * Zod member parts - handles optional, default values, and other model property modifiers.
 */

import { Children } from "@alloy-js/core";
import { ModelProperty } from "@typespec/compiler";
import { Typekit } from "@typespec/compiler/typekit";
import { useTsp } from "@typespec/emitter-framework";
import { ValueExpression } from "@typespec/emitter-framework/typescript";
import { callPart } from "./utils.js";

export function zodMemberParts(member?: ModelProperty) {
  const { $ } = useTsp();
  return [...optionalParts(member), ...defaultParts($, member)];
}

function defaultParts($: Typekit, member?: ModelProperty) {
  if (!member?.defaultValue) {
    return [];
  }

  return [callPart("default", renderDefaultExpression($, member))];
}

function optionalParts(member?: ModelProperty) {
  if (!member?.optional) {
    return [];
  }

  return [callPart("optional")];
}

function renderDefaultExpression($: Typekit, member: ModelProperty): Children {
  const value = member.defaultValue!;

  switch (value.valueKind) {
    case "StringValue":
      return JSON.stringify(value.value);
    case "BooleanValue":
      return String(value.value);
    case "NumericValue":
      return renderNumericDefault($, member, value.value);
    case "EnumValue":
      return JSON.stringify(value.value.value ?? value.value.name);
    default:
      return <ValueExpression value={value} />;
  }
}

function renderNumericDefault(
  $: Typekit,
  member: ModelProperty,
  value: { toString(): string },
): string {
  if (usesBigIntSchema($, member)) {
    return `${value.toString()}n`;
  }

  return value.toString();
}

function usesBigIntSchema($: Typekit, member: ModelProperty): boolean {
  const type = member.type.kind === "ModelProperty" ? member.type.type : member.type;

  if (type.kind !== "Scalar") {
    return false;
  }

  if (!$.scalar.extendsNumeric(type) || !$.scalar.extendsInteger(type)) {
    return false;
  }

  return (
    !$.scalar.extendsInt32(type) && !$.scalar.extendsUint32(type) && !$.scalar.extendsSafeint(type)
  );
}
