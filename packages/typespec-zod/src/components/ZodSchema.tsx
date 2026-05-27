/**
 * ZodSchema component - translates a TypeSpec type into a Zod schema.
 */

import { Children, refkey } from "@alloy-js/core";
import { MemberExpression } from "@alloy-js/typescript";
import { Type } from "@typespec/compiler";
import { useTsp } from "@typespec/emitter-framework";
import { getRefines } from "@qninhdt/typespec-orm";
import { callPart, refkeySym, shouldReference, zodMemberExpr } from "../utils.js";
import { zodBaseSchemaParts } from "../zod-base-schema.js";
import { zodConstraintsParts } from "../zod-constraints.js";
import { zodDescriptionParts } from "../zod-description.js";
import { zodMemberParts } from "../zod-member-parts.js";
import { getZodOptions } from "../context/zod-options.js";
import { isModelInCycle } from "../traversal.js";

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
    const refineParts =
      props.type.kind === "Model"
        ? getRefines($.program, props.type).map((r) =>
            callPart(
              "refine",
              `(data) => ${r.expression}`,
              `{ message: ${JSON.stringify(r.name)} }`,
            ),
          )
        : [];
    return (
      <MemberExpression>
        {zodBaseSchemaParts(props.type)}
        {zodConstraintsParts(props.type)}
        {zodDescriptionParts(props.type)}
        {brandParts}
        {refineParts}
      </MemberExpression>
    );
  }

  // we are in reference context
  const { member, type } = $.modelProperty.is(props.type)
    ? { member: props.type, type: props.type.type }
    : { type: props.type };

  if (shouldReference($.program, type)) {
    // Wrap references to models that participate in a reference cycle in
    // `z.lazy(() => Schema)` so self-referential and mutually-recursive
    // models don't blow up at module init time.
    if (type.kind === "Model" && isModelInCycle(type)) {
      const lazyArg = (
        <>
          {"() => "}
          <MemberExpression>
            <MemberExpression.Part refkey={refkey(type, refkeySym)} />
          </MemberExpression>
        </>
      );
      return (
        <MemberExpression>
          {zodMemberExpr(callPart("lazy", lazyArg))}
          {zodConstraintsParts(type, member)}
          {zodMemberParts(member)}
          {zodDescriptionParts(type, member)}
        </MemberExpression>
      );
    }
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
