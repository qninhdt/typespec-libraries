/**
 * Zod base schema dispatcher. Maps a TypeSpec type to its Zod base schema
 * by delegating to scalar/model/union helpers.
 */

import { Children } from "@alloy-js/core";
import { Enum, EnumMember, LiteralType, Type } from "@typespec/compiler";
import { Typekit } from "@typespec/compiler/typekit";
import { useTsp } from "@typespec/emitter-framework";
import { For } from "@alloy-js/core";
import { ArrayExpression } from "@alloy-js/typescript";
import { callPart, zodMemberExpr } from "./utils.js";
import { reportDiagnostic } from "./lib.js";
import { intrinsicBaseType, scalarBaseType } from "./scalar-base.js";
import { modelBaseType, tupleBaseType } from "./model-base.js";
import { unionBaseType } from "./union-base.js";

/**
 * Returns the identifier parts for the base Zod schema for a given TypeSpec
 * type.
 */
export function zodBaseSchemaParts(type: Type): Children {
  const { $ } = useTsp();

  switch (type.kind) {
    case "Intrinsic":
      return intrinsicBaseType(type);
    case "String":
    case "Number":
    case "Boolean":
      return literalBaseType($, type);
    case "Scalar":
      return scalarBaseType($, type);
    case "Model":
      return modelBaseType(type);
    case "Union":
      return unionBaseType(type);
    case "Enum":
      return enumBaseType(type);
    case "ModelProperty":
      return zodBaseSchemaParts(type.type);
    case "EnumMember":
      return type.value !== undefined
        ? literalBaseType($, $.literal.create(type.value))
        : literalBaseType($, $.literal.create(type.name));
    case "Tuple":
      return tupleBaseType(type);
    default:
      reportDiagnostic($.program, {
        code: "unsupported-type",
        target: type,
      });
      return zodMemberExpr(callPart("never"));
  }
}

function literalBaseType(_$: Typekit, type: LiteralType): Children {
  switch (type.kind) {
    case "String":
      return zodMemberExpr(callPart("literal", JSON.stringify(type.value)));
    case "Number":
    case "Boolean":
      return zodMemberExpr(callPart("literal", `${type.value}`));
  }
}

function enumBaseType(type: Enum): Children {
  const values = [...type.members.values()].map(enumMemberValue);
  const allStringValues = values.every((value) => typeof value === "string");

  if (!allStringValues) {
    if (values.length === 1) {
      return zodMemberExpr(callPart("literal", enumLiteralValue(values[0])));
    }

    return zodMemberExpr(
      callPart(
        "union",
        <ArrayExpression>
          <For each={values} comma line>
            {(value: string | number) =>
              zodMemberExpr(callPart("literal", enumLiteralValue(value)))
            }
          </For>
        </ArrayExpression>,
      ),
    );
  }

  return zodMemberExpr(
    callPart(
      "enum",
      <ArrayExpression>
        <For each={values} comma line>
          {(value: string | number) => JSON.stringify(value)}
        </For>
      </ArrayExpression>,
    ),
  );
}

function enumMemberValue(member: EnumMember): string | number {
  return member.value === undefined ? member.name : member.value;
}

function enumLiteralValue(value: string | number): string {
  return typeof value === "number" ? String(value) : JSON.stringify(value);
}
