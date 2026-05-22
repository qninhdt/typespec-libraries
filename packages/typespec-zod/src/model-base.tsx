/**
 * Model base schema resolution. Walks model properties (own + inherited),
 * builds the z.object({...}) expression, and handles record indexers and
 * inheritance via z.extend().
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
  Model,
  ModelProperty,
  Program,
  Tuple,
  walkPropertiesInherited,
} from "@typespec/compiler";
import { useTsp } from "@typespec/emitter-framework";
import { isData, isTableMixin } from "@qninhdt/typespec-orm";
import { ZodCustomTypeComponent } from "./components/ZodCustomTypeComponent.js";
import { ZodSchema } from "./components/ZodSchema.js";
import {
  callPart,
  getModelOwnProperties,
  isDeclaration,
  isRecord,
  refkeySym,
  shouldReference,
  zodMemberExpr,
} from "./utils.js";

export function modelBaseType(type: Model): Children {
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
        <MemberExpression.Part id="extend" />
        <MemberExpression.Part args={[memberObject]} />
      </MemberExpression>
    );
  }

  return parts;
}

export function tupleBaseType(type: Tuple): Children {
  // Only the base z.tuple([...])
  return zodMemberExpr(
    callPart(
      "tuple",
      <ArrayExpression>
        <For each={type.values} comma line>
          {(item: Tuple["values"][number]) => <ZodSchema type={item} nested />}
        </For>
      </ArrayExpression>,
    ),
  );
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
        {(prop: ModelProperty) => (
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
