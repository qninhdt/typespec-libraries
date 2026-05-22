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

export function scalarBaseType($: Typekit, type: Scalar): Children {
  if (type.baseScalar && shouldReference($.program, type.baseScalar)) {
    return <MemberExpression.Part refkey={refkey(type.baseScalar, refkeySym)} />;
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
  if (!$.scalar.extendsInteger(type)) {
    return zodMemberExpr(callPart("number"));
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
        callPart("union", <ArrayExpression>
          <For each={["ipv4", "ipv6"]} comma line>
            {(name: string) => zodMemberExpr(callPart(name))}
          </For>
        </ArrayExpression>),
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

  return $.scalar.extendsUrl(type)
    ? zodMemberExpr(callPart("url"))
    : zodMemberExpr(callPart("string"));
}

function datetimeScalarBaseType($: Typekit, type: Scalar): Children {
  const encoding = $.scalar.getEncoding(type);
  if (!encoding) {
    return zodMemberExpr(idPart("coerce"), callPart("date"));
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
      return zodMemberExpr(callPart("never"));
  }
}
