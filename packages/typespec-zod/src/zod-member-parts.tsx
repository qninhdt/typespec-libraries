/**
 * Zod member parts - handles optional, default values, and other model property modifiers.
 */

import type { Program } from "@typespec/compiler";
import { ModelProperty } from "@typespec/compiler";
import { Typekit } from "@typespec/compiler/typekit";
import { useTsp } from "@typespec/emitter-framework";
import { ValueExpression } from "@typespec/emitter-framework/typescript";
import { callPart } from "./utils.js";

export function zodMemberParts(member?: ModelProperty) {
  const { $ } = useTsp();
  return [...optionalParts($.program, member), ...defaultParts($, member)];
}

function defaultParts($: Typekit, member?: ModelProperty) {
  if (!member || !member.defaultValue) {
    return [];
  }

  return [callPart("default", [<ValueExpression value={member.defaultValue} />])];
}

function optionalParts(program: Program, member?: ModelProperty) {
  if (!member || !member.optional) {
    return [];
  }

  return [callPart("optional")];
}
