/**
 * Zod member parts - handles optional, default values, and other model property modifiers.
 */

import { Children } from "@alloy-js/core";
import { ModelProperty } from "@typespec/compiler";
import { Typekit } from "@typespec/compiler/typekit";
import { useTsp } from "@typespec/emitter-framework";
import { ValueExpression } from "@typespec/emitter-framework/typescript";
import { callPart } from "./utils.js";
import { getZodOptions } from "./context/zod-options.js";
import { isPropertyNullable } from "./nullable.js";

export function zodMemberParts(member?: ModelProperty) {
  const { $ } = useTsp();
  return [...defaultParts($, member), ...optionalParts(member), ...nullableParts($, member)];
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

function nullableParts($: Typekit, member?: ModelProperty) {
  if (!member) return [];
  // A property's `nullable` modifier in TypeSpec surfaces as `T | null`
  // (or a literal `null`) in the property's resolved type. The base
  // schema renders that union faithfully; when this property carries a
  // null branch we ALSO append `.nullable()` so the wrapper schema
  // accepts `null` after `.optional()` / `.default()` chains apply.
  if (!isPropertyNullable($, member)) {
    return [];
  }

  return [callPart("nullable")];
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
  const wide = isWideIntegerSchema($, member);
  if (!wide) {
    return value.toString();
  }

  const strategy = getZodOptions($.program)["int64-strategy"] ?? "string";
  switch (strategy) {
    case "bigint":
      return `${value.toString()}n`;
    case "string":
      return JSON.stringify(value.toString());
    case "number":
    default:
      return value.toString();
  }
}

function isWideIntegerSchema($: Typekit, member: ModelProperty): boolean {
  let type = member.type;
  while (type.kind === "ModelProperty") {
    type = type.type;
  }

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
