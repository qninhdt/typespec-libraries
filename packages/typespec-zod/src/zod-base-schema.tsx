/**
 * Zod base schema - maps TypeSpec types to Zod base schemas.
 */

import { Children, For, refkey } from "@alloy-js/core";
import {
  ArrayExpression,
  MemberExpression,
  ObjectExpression,
  ObjectProperty,
} from "@alloy-js/typescript";
import { Enum, LiteralType, Model, Scalar, Tuple, Type, Union } from "@typespec/compiler";
import { Typekit } from "@typespec/compiler/typekit";
import { useTsp } from "@typespec/emitter-framework";
import { ZodCustomTypeComponent } from "./components/ZodCustomTypeComponent.js";
import { ZodSchema } from "./components/ZodSchema.js";
import {
  callPart,
  idPart,
  isDeclaration,
  isRecord,
  refkeySym,
  shouldReference,
  zodMemberExpr,
} from "./utils.js";

/**
 * Returns the identifier parts for the base Zod schema for a given TypeSpec
 * type.
 */
export function zodBaseSchemaParts(type: Type) {
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
      return type.value
        ? literalBaseType($, $.literal.create(type.value))
        : literalBaseType($, $.literal.create(type.name));
    case "Tuple":
      return tupleBaseType(type);
    default:
      return zodMemberExpr(callPart("any"));
  }
}

function literalBaseType($: Typekit, type: LiteralType) {
  switch (type.kind) {
    case "String":
      return zodMemberExpr(callPart("literal", `"${type.value}"`));
    case "Number":
    case "Boolean":
      return zodMemberExpr(callPart("literal", `${type.value}`));
  }
}

function scalarBaseType($: Typekit, type: Scalar): Children {
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
    return zodMemberExpr(callPart("instanceof"), "Uint8Array");
  }
  if ($.scalar.extendsPlainDate(type)) {
    return zodMemberExpr(idPart("coerce"), callPart("date"));
  }
  if ($.scalar.extendsPlainTime(type)) {
    return zodMemberExpr(callPart("string"), callPart("time"));
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

  return zodMemberExpr(callPart("any"));
}

function enumBaseType(type: Enum) {
  // Only the base z.enum([...])
  // We want: zodMemberExpr(callPart("enum", ...))
  return zodMemberExpr(
    callPart(
      "enum",
      <ArrayExpression>
        <For each={type.members.values()} comma line>
          {(member: any) => (
            <ZodCustomTypeComponent
              type={member}
              Declaration={(props: { children?: Children }) => props.children}
              declarationProps={{}}
              declare
            >
              {JSON.stringify(member.value ?? member.name)}
            </ZodCustomTypeComponent>
          )}
        </For>
      </ArrayExpression>,
    ),
  );
}

function tupleBaseType(type: Tuple) {
  // Only the base z.tuple([...])
  // We want: zodMemberExpr(callPart("tuple", ...))
  return zodMemberExpr(
    callPart(
      "tuple",
      <ArrayExpression>
        <For each={type.values} comma line>
          {(item: any) => <ZodSchema type={item} nested />}
        </For>
      </ArrayExpression>,
    ),
  );
}

function modelBaseType(type: Model) {
  const { $ } = useTsp();

  if ($.array.is(type)) {
    return zodMemberExpr(callPart("array", <ZodSchema type={type.indexer!.value} nested />));
  }

  let recordPart: Children | undefined;
  if (
    isRecord($.program, type) ||
    (!!type.baseModel &&
      isRecord($.program, type.baseModel) &&
      !isDeclaration($.program, type.baseModel))
  ) {
    recordPart = zodMemberExpr(
      callPart(
        "record",
        <ZodSchema type={(type.indexer ?? type.baseModel!.indexer)!.key} nested />,
        <ZodSchema type={(type.indexer ?? type.baseModel!.indexer)!.value} nested />,
      ),
    );
  }

  let memberPart: Children | undefined;
  if (type.properties.size > 0) {
    const members = (
      <ObjectExpression>
        <For each={type.properties.values()} comma enderPunctuation>
          {(prop: any) => (
            <ZodCustomTypeComponent
              type={prop}
              declare
              Declaration={ObjectProperty}
              declarationProps={{ name: prop.name }}
            >
              <ObjectProperty name={prop.name}>
                <ZodSchema type={prop} nested />
              </ObjectProperty>
            </ZodCustomTypeComponent>
          )}
        </For>
      </ObjectExpression>
    );
    memberPart = zodMemberExpr(callPart("object", members));
  }

  const parts = combineModelSchemaParts(memberPart, recordPart);

  if (type.baseModel && shouldReference($.program, type.baseModel)) {
    return (
      <MemberExpression>
        <MemberExpression.Part refkey={refkey(type.baseModel, refkeySym)} />
        <MemberExpression.Part id="merge" />
        <MemberExpression.Part args={[parts]} />
      </MemberExpression>
    );
  }

  return parts;
}

function unionBaseType(type: Union) {
  const { $ } = useTsp();

  const discriminated = $.union.getDiscriminatedUnion(type);

  if ($.union.isExpression(type) || !discriminated) {
    return zodMemberExpr(
      callPart(
        "union",
        <ArrayExpression>
          <For each={type.variants} comma line>
            {(name: any, variant: any) => {
              return <ZodSchema type={variant.type} nested />;
            }}
          </For>
        </ArrayExpression>,
      ),
    );
  }

  const propKey = discriminated.options.discriminatorPropertyName;
  const envKey = discriminated.options.envelopePropertyName;
  const unionArgs = [
    `"${propKey}"`,
    <ArrayExpression>
      <For each={Array.from(type.variants.values())} comma line>
        {(variant: any) => {
          if (discriminated.options.envelope === "object") {
            return <ZodSchema type={createEnvelopeModel($, propKey, envKey, variant)} nested />;
          }
          return <ZodSchema type={variant.type} nested />;
        }}
      </For>
    </ArrayExpression>,
  ];

  return zodMemberExpr(callPart("discriminatedUnion", ...unionArgs));
}

function intrinsicBaseType(type: Type) {
  if (type.kind !== "Intrinsic") {
    return zodMemberExpr(callPart("any"));
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
      return zodMemberExpr(callPart("any"));
  }
}

function numericScalarBaseType($: Typekit, type: Scalar): Children {
  if (!$.scalar.extendsInteger(type)) {
    return zodMemberExpr(callPart("number"));
  }

  const usesNumberSchema =
    $.scalar.extendsInt32(type) || $.scalar.extendsUint32(type) || $.scalar.extendsSafeint(type);
  return usesNumberSchema
    ? zodMemberExpr(callPart("number"), callPart("int"))
    : zodMemberExpr(callPart("bigint"));
}

function stringScalarBaseType($: Typekit, type: Scalar): Children {
  return $.scalar.extendsUrl(type)
    ? zodMemberExpr(callPart("string"), callPart("url"))
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
    return zodMemberExpr(callPart("string"), callPart("datetime"));
  }
  return scalarBaseType($, encoding.type);
}

function offsetDateTimeScalarBaseType($: Typekit, type: Scalar): Children {
  const encoding = $.scalar.getEncoding(type);
  if (!encoding) {
    return zodMemberExpr(idPart("coerce"), callPart("date"));
  }

  return encoding.encoding === "rfc3339"
    ? zodMemberExpr(callPart("string"), callPart("datetime"))
    : scalarBaseType($, encoding.type);
}

function durationScalarBaseType($: Typekit, type: Scalar): Children {
  const encoding = $.scalar.getEncoding(type);
  if (!encoding || encoding.encoding === "ISO8601") {
    return zodMemberExpr(callPart("string"), callPart("duration"));
  }
  return scalarBaseType($, encoding.type);
}

function combineModelSchemaParts(
  memberPart: Children | undefined,
  recordPart: Children | undefined,
): Children {
  if (!memberPart && !recordPart) {
    return zodMemberExpr(callPart("object", <ObjectExpression />));
  }
  if (memberPart && recordPart) {
    return zodMemberExpr(callPart("intersection", memberPart, recordPart));
  }
  return memberPart ?? recordPart;
}

function createEnvelopeModel(
  $: Typekit,
  propKey: string,
  envKey: string,
  variant: { name: string; type: Type },
): Model {
  return $.model.create({
    properties: {
      [propKey]: $.modelProperty.create({
        name: propKey,
        type: $.literal.create(variant.name),
      }),
      [envKey]: $.modelProperty.create({
        name: envKey,
        type: variant.type,
      }),
    },
  });
}
