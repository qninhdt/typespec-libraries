/**
 * Scalar base schema resolution. Maps TypeSpec scalar types to Zod base
 * schemas (string/number/boolean/date/etc) and applies custom scalar
 * overrides.
 */

import { Children } from "@alloy-js/core";
import { ArrayExpression } from "@alloy-js/typescript";
import { For, refkey } from "@alloy-js/core";
import { MemberExpression } from "@alloy-js/typescript";
import { Scalar, Type } from "@typespec/compiler";
import { Typekit } from "@typespec/compiler/typekit";
import { callPart, idPart, refkeySym, shouldReference, zodMemberExpr } from "./utils.js";
import { reportDiagnostic } from "./lib.js";
import { getZodOptions } from "./context/zod-options.js";
import { getPattern } from "@typespec/compiler";
import { isBuiltIn } from "@qninhdt/typespec-orm";

function isCompositeScalar(type: Type): boolean {
  if (type.kind !== "Scalar") return false;
  let current: Scalar | undefined = type;
  while (current) {
    if (current.name === "composite") return true;
    current = current.baseScalar;
  }
  return false;
}

export function scalarBaseType($: Typekit, type: Scalar): Children {
  if (type.baseScalar && shouldReference($.program, type.baseScalar)) {
    return <MemberExpression.Part refkey={refkey(type.baseScalar, refkeySym)} />;
  }

  // ORM-only scalars (composite indexes) have no runtime representation
  if (isCompositeScalar(type)) {
    return zodMemberExpr(callPart("never"));
  }

  if ($.scalar.extendsBoolean(type)) {
    return zodMemberExpr(callPart("boolean"));
  }
  if ($.scalar.extendsNumeric(type)) {
    return numericScalarBaseType($, type);
  }
  if ($.scalar.extendsString(type)) {
    return stringScalarBaseType($, type);
  }
  if ($.scalar.extendsBytes(type)) {
    return zodMemberExpr(callPart("instanceof", "Uint8Array"));
  }
  if ($.scalar.extendsPlainDate(type)) {
    return zodMemberExpr(idPart("coerce"), callPart("date"));
  }
  if ($.scalar.extendsPlainTime(type)) {
    return zodMemberExpr(idPart("iso"), callPart("time"));
  }
  if ($.scalar.extendsUtcDateTime(type)) {
    return datetimeScalarBaseType($, type);
  }
  if ($.scalar.extendsOffsetDateTime(type)) {
    return offsetDateTimeScalarBaseType($, type);
  }
  if ($.scalar.extendsDuration(type)) {
    return durationScalarBaseType($, type);
  }

  reportDiagnostic($.program, {
    code: "unsupported-type",
    target: type,
  });
  return zodMemberExpr(callPart("never"));
}

function numericScalarBaseType($: Typekit, type: Scalar): Children {
  // Decimal types map to a string-precise representation to avoid the
  // precision loss that comes with parsing arbitrary-precision decimals
  // through the JS `number` type.
  if ($.scalar.extendsDecimal(type) || $.scalar.extendsDecimal128(type)) {
    return zodMemberExpr(
      callPart("string"),
      callPart("regex", "/^-?\\d+(\\.\\d+)?$/"),
      callPart("describe", JSON.stringify("decimal")),
    );
  }

  if (!$.scalar.extendsInteger(type)) {
    if ($.scalar.extendsFloat(type)) {
      return zodMemberExpr(callPart("number"));
    }
    // Numeric scalar that's neither integer, float, nor decimal — fail loud
    // rather than silently returning z.number() and surprising callers.
    reportDiagnostic($.program, {
      code: "unsupported-type",
      target: type,
    });
    return zodMemberExpr(callPart("never"));
  }

  const usesNumberSchema =
    $.scalar.extendsInt32(type) || $.scalar.extendsUint32(type) || $.scalar.extendsSafeint(type);
  if (usesNumberSchema) {
    return zodMemberExpr(callPart("number"), callPart("int"));
  }

  const strategy = getZodOptions($.program)["int64-strategy"] ?? "string";
  switch (strategy) {
    case "bigint":
      return zodMemberExpr(callPart("bigint"));
    case "number":
      // Note: values >2^53 will lose precision when parsed as JS number.
      return zodMemberExpr(callPart("number"), callPart("int"));
    case "string":
    default:
      return zodMemberExpr(callPart("string"), callPart("regex", "/^-?\\d+$/"));
  }
}

function stringScalarBaseType($: Typekit, type: Scalar): Children {
  // Plain `string` is the base case: always emits z.string(), constraints
  // (min/max length, pattern) attach later.
  if (type.name === "string") return zodMemberExpr(callPart("string"));
  // Check scalar name directly for DB scalars that have Zod native methods
  if (type.name === "uuid") return zodMemberExpr(callPart("uuid"));

  switch (type.name) {
    // Zod 4 has top-level functions for these validators
    case "email":
      return zodMemberExpr(callPart("email"));
    case "url":
      return zodMemberExpr(callPart("url"));
    case "ipv4":
      return zodMemberExpr(callPart("ipv4"));
    case "ipv6":
      return zodMemberExpr(callPart("ipv6"));
    case "ip":
      // Zod 4 removed `z.ip()` in favor of separate ipv4/ipv6 functions.
      return zodMemberExpr(
        callPart(
          "union",
          <ArrayExpression>
            <For each={["ipv4", "ipv6"]} comma line>
              {(name: string) => zodMemberExpr(callPart(name))}
            </For>
          </ArrayExpression>,
        ),
      );
    case "cidr":
      return zodMemberExpr(callPart("cidr"));
    case "base64":
      return zodMemberExpr(callPart("base64"));
    case "cuid":
      return zodMemberExpr(callPart("cuid"));
    case "cuid2":
      return zodMemberExpr(callPart("cuid2"));
    case "ulid":
      return zodMemberExpr(callPart("ulid"));
    case "nanoid":
      return zodMemberExpr(callPart("nanoid"));
    case "jwt":
      return zodMemberExpr(callPart("jwt"));
    case "emoji":
      return zodMemberExpr(callPart("emoji"));
    // No native Zod method — constraints from decorators on the scalar
    // (e.g. @pattern on mac/hostname) will be applied via zodConstraintsParts.
    case "mac":
    case "hostname":
    default:
      break;
  }

  // Note: `extendsUrl` is unreachable here — `case "url"` above matches first
  // for the built-in scalar. User-defined scalars extending `url` would also
  // hit `case "url"` after stdBase resolution, so the explicit branch was
  // dead. If we got here it's `mac`/`hostname` or an unknown built-in string
  // scalar with no native Zod method. User-defined scalars extending `string`
  // (e.g. `scalar StrongPassword extends string`) reach this branch too;
  // their constraints will be applied later by `zodConstraintsParts`, so we
  // emit `z.string()` as the fallback. Fail loud only for built-in scalars
  // we don't know how to map and that don't carry validation.
  if (isBuiltIn($.program, type) && !hasPatternConstraint($, type)) {
    reportDiagnostic($.program, {
      code: "unsupported-format",
      target: type,
      format: { name: type.name },
    });
    return zodMemberExpr(callPart("never"));
  }
  return zodMemberExpr(callPart("string"));
}

/**
 * Returns true if the scalar (or any of its base scalars) carries a `@pattern`
 * decorator. We accept either the typed accessor or the raw decorator list so
 * we degrade safely if the decorator name shape ever changes.
 */
function hasPatternConstraint($: Typekit, type: Scalar): boolean {
  let current: Scalar | undefined = type;
  while (current) {
    const pattern = getPattern($.program, current);
    if (typeof pattern === "string" && pattern.length > 0) return true;
    if ("decorators" in current && Array.isArray(current.decorators)) {
      for (const dec of current.decorators) {
        const name = dec.definition?.name ?? dec.decorator?.name ?? "";
        if (name === "@pattern" || name === "$pattern") return true;
      }
    }
    current = current.baseScalar;
  }
  return false;
}

function datetimeScalarBaseType($: Typekit, type: Scalar): Children {
  const encoding = $.scalar.getEncoding(type);
  if (!encoding) {
    // Default: render an ISO-8601 datetime *string* schema. We deliberately
    // avoid `z.coerce.date()` because coercion mutates input (string -> Date)
    // and would cause `parse(input)` to silently change the value type.
    return zodMemberExpr(idPart("iso"), callPart("datetime"));
  }

  if (encoding.encoding === "unixTimestamp") {
    return scalarBaseType($, encoding.type);
  }
  if (encoding.encoding === "rfc3339") {
    return zodMemberExpr(idPart("iso"), callPart("datetime"));
  }
  return scalarBaseType($, encoding.type);
}

function offsetDateTimeScalarBaseType($: Typekit, type: Scalar): Children {
  const encoding = $.scalar.getEncoding(type);
  if (!encoding) {
    return zodMemberExpr(idPart("coerce"), callPart("date"));
  }

  return encoding.encoding === "rfc3339"
    ? zodMemberExpr(idPart("iso"), callPart("datetime"))
    : scalarBaseType($, encoding.type);
}

function durationScalarBaseType($: Typekit, type: Scalar): Children {
  const encoding = $.scalar.getEncoding(type);
  if (!encoding || encoding.encoding === "ISO8601") {
    return zodMemberExpr(idPart("iso"), callPart("duration"));
  }
  return scalarBaseType($, encoding.type);
}

export function intrinsicBaseType(type: Type): Children {
  if (type.kind !== "Intrinsic") {
    return zodMemberExpr(callPart("never"));
  }

  switch (type.name) {
    case "null":
      return zodMemberExpr(callPart("null"));
    case "never":
      return zodMemberExpr(callPart("never"));
    case "unknown":
      return zodMemberExpr(callPart("unknown"));
    case "void":
      return zodMemberExpr(callPart("void"));
    default:
      // Unknown intrinsic — fail loud rather than silently returning
      // z.never() and producing a schema that rejects everything without
      // explanation.
      // We don't have access to a Program here, so emission of the diagnostic
      // happens via the caller (`zodBaseSchemaParts` already routes unknown
      // type kinds through `unsupported-type`).
      return zodMemberExpr(callPart("never"));
  }
}
