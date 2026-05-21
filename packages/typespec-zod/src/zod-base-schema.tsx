/**
 * Zod base schema - maps TypeSpec types to Zod base schemas.
 */

import { Children, For, refkey } from "@alloy-js/core";
import {
  ArrayExpression,
  MemberExpression,
  ObjectExpression,
  ObjectProperty,
  ObjectSpreadProperty,
} from "@alloy-js/typescript";
import {
  Enum,
  EnumMember,
  LiteralType,
  Model,
  ModelProperty,
  Program,
  Scalar,
  Tuple,
  Type,
  Union,
  walkPropertiesInherited,
} from "@typespec/compiler";
import { Typekit } from "@typespec/compiler/typekit";
import { useTsp } from "@typespec/emitter-framework";
import { getModelOwnProperties, isData, isTableMixin } from "@qninhdt/typespec-orm";
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
import { reportDiagnostic } from "./lib.js";

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
      return zodMemberExpr(callPart("any"));
  }
}

function literalBaseType($: Typekit, type: LiteralType) {
  switch (type.kind) {
    case "String":
      return zodMemberExpr(callPart("literal", JSON.stringify(type.value)));
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
    return zodMemberExpr(callPart("instanceof", "Uint8Array"));
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

  reportDiagnostic($.program, {
    code: "unsupported-type",
    target: type,
  });
  return zodMemberExpr(callPart("any"));
}

function enumBaseType(type: Enum) {
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

  const sourceModels = getReferenceSourceModels($.program, type);
  const properties = getModelSchemaProperties($.program, type, sourceModels.length > 0);
  const memberObject = buildModelObjectExpression(properties, sourceModels.slice(1));
  let memberPart: Children | undefined;
  if (properties.length > 0 || sourceModels.length > 1) {
    memberPart = zodMemberExpr(callPart("object", memberObject));
  }

  const parts = combineModelSchemaParts(memberPart, recordPart);

  if (sourceModels.length > 0) {
    return (
      <MemberExpression>
        <MemberExpression.Part refkey={refkey(sourceModels[0], refkeySym)} />
        <MemberExpression.Part id="safeExtend" />
        <MemberExpression.Part args={[memberObject]} />
      </MemberExpression>
    );
  }

  return parts;
}

function buildModelObjectExpression(properties: ModelProperty[], extraSourceModels: Model[]) {
  return (
    <ObjectExpression>
      <For each={extraSourceModels} comma enderPunctuation>
        {(sourceModel: Model) => (
          <ObjectSpreadProperty>
            <MemberExpression>
              <MemberExpression.Part refkey={refkey(sourceModel, refkeySym)} />
              <MemberExpression.Part id="shape" />
            </MemberExpression>
          </ObjectSpreadProperty>
        )}
      </For>
      <For each={properties} comma enderPunctuation>
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
}

function getReferenceSourceModels(program: Program, type: Model): Model[] {
  const sources = new Map<string, Model>();
  for (const source of type.sourceModels) {
    if (
      shouldReference(program, source.model) &&
      (isData(program, source.model) || isTableMixin(program, source.model))
    ) {
      sources.set(source.model.name, source.model);
    }
  }
  if (
    type.baseModel &&
    shouldReference(program, type.baseModel) &&
    (isData(program, type.baseModel) || isTableMixin(program, type.baseModel))
  ) {
    sources.set(type.baseModel.name, type.baseModel);
  }
  return [...sources.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function getModelSchemaProperties(program: Program, type: Model, ownOnly: boolean) {
  if (ownOnly || (type.baseModel && shouldReference(program, type.baseModel))) {
    return getModelOwnProperties(type);
  }

  return [...walkPropertiesInherited(type)];
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
    JSON.stringify(propKey),
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
  // Check scalar name directly for DB scalars that have Zod native methods
  if (type.name === "uuid") return zodMemberExpr(callPart("string"), callPart("uuid"));

  switch (type.name) {
    // Zod has native support for these validators
    case "email":
      return zodMemberExpr(callPart("string"), callPart("email"));
    case "url":
      return zodMemberExpr(callPart("string"), callPart("url"));
    case "ipv4":
      return zodMemberExpr(callPart("string"), callPart("ipv4"));
    case "ipv6":
      return zodMemberExpr(callPart("string"), callPart("ipv6"));
    case "ip":
      return zodMemberExpr(callPart("string"), callPart("ip"));
    case "cidr":
      return zodMemberExpr(callPart("string"), callPart("cidr"));
    case "base64":
      return zodMemberExpr(callPart("string"), callPart("base64"));
    case "cuid":
      return zodMemberExpr(callPart("string"), callPart("cuid"));
    case "cuid2":
      return zodMemberExpr(callPart("string"), callPart("cuid2"));
    case "ulid":
      return zodMemberExpr(callPart("string"), callPart("ulid"));
    case "nanoid":
      return zodMemberExpr(callPart("string"), callPart("nanoid"));
    case "jwt":
      return zodMemberExpr(callPart("string"), callPart("jwt"));
    case "emoji":
      return zodMemberExpr(callPart("string"), callPart("emoji"));
    // No native Zod method — constraints from decorators on the scalar
    // (e.g. @pattern on mac/hostname) will be applied via zodConstraintsParts.
    case "mac":
    case "hostname":
    default:
      break;
  }

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
