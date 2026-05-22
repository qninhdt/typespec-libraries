/**
 * ZodSchema component - translates a TypeSpec type into a Zod schema.
 */

import { Children, refkey } from "@alloy-js/core";
import { MemberExpression } from "@alloy-js/typescript";
import { Type } from "@typespec/compiler";
import { useTsp } from "@typespec/emitter-framework";
import { callPart, refkeySym, shouldReference } from "../utils.js";
import { zodBaseSchemaParts } from "../zod-base-schema.js";
import { zodConstraintsParts } from "../zod-constraints.js";
import { zodDescriptionParts } from "../zod-description.js";
import { zodMemberParts } from "../zod-member-parts.js";
import { getZodOptions } from "../context/zod-options.js";

export interface ZodSchemaProps {
  readonly type: Type;
  readonly nested?: boolean;
}

/**
 * Component that translates a TypeSpec type into the Zod type
 */
export function ZodSchema(props: ZodSchemaProps): Children {
  const { $ } = useTsp();

  if (!props.nested) {
    // we are making a declaration
    const brandEnabled = getZodOptions($.program)["branded-scalars"] ?? false;
    const brandParts =
      brandEnabled && props.type.kind === "Scalar"
        ? [callPart("brand", JSON.stringify(props.type.name))]
        : [];
    return (
      <MemberExpression>
        {zodBaseSchemaParts(props.type)}
        {zodConstraintsParts(props.type)}
        {zodDescriptionParts(props.type)}
        {brandParts}
      </MemberExpression>
    );
  }

  // we are in reference context
  const { member, type } = $.modelProperty.is(props.type)
    ? { member: props.type, type: props.type.type }
    : { type: props.type };

  if (shouldReference($.program, type)) {
    return (
      <MemberExpression>
        <MemberExpression.Part refkey={refkey(type, refkeySym)} />
        {zodConstraintsParts(type, member)}
        {zodMemberParts(member)}
        {zodDescriptionParts(type, member)}
      </MemberExpression>
    );
  }

  return (
    <MemberExpression>
      {zodBaseSchemaParts(type)}
      {zodConstraintsParts(type, member)}
      {zodMemberParts(member)}
      {zodDescriptionParts(type, member)}
    </MemberExpression>
  );
}
