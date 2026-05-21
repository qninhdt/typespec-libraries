/**
 * Utility functions for the Zod emitter.
 */

import { Refkey } from "@alloy-js/core";
import { Children } from "@alloy-js/core/jsx-runtime";
import { FunctionCallExpression, MemberExpression } from "@alloy-js/typescript";
import { Program, Type, walkPropertiesInherited } from "@typespec/compiler";
import { $ } from "@typespec/compiler/typekit";
import { SCCSet } from "@typespec/emitter-framework";
import { isBuiltIn, isCustomScalar } from "@qninhdt/typespec-orm";
export { isBuiltIn };
import { zod } from "./external-packages/zod.js";

export const refkeySym = Symbol.for("typespec-zod.refkey");

export const ZOD_NATIVE_SCALARS = new Set([
  "uuid",
  "email",
  "url",
  "ipv4",
  "ipv6",
  "ip",
  "cidr",
  "base64",
  "cuid",
  "cuid2",
  "ulid",
  "nanoid",
  "jwt",
  "emoji",
]);

/**
 * Converts a string to PascalCase.
 * e.g. "foo-bar_baz" → "FooBarBaz"
 */
export function toPascalCase(str: string): string {
  return (
    str.charAt(0).toUpperCase() + str.slice(1).replaceAll(/[-_](.)/g, (_, c) => c.toUpperCase())
  );
}

/**
 * Returns true if the given type is a declaration or an instantiation of a
 * declaration.
 */
export function isDeclaration(program: Program, type: Type): boolean {
  switch (type.kind) {
    case "Namespace":
    case "Interface":
    case "Operation":
    case "EnumMember":
      // Enum members are emitted inline rather than as standalone declarations.
      return false;
    case "UnionVariant":
      return false;

    case "Model":
      if (($(program).array.is(type) || $(program).record.is(type)) && isBuiltIn(program, type)) {
        return false;
      }

      return Boolean(type.name);
    case "Union":
      return Boolean(type.name);
    case "Enum":
      return false;
    case "Scalar":
      return true;
    default:
      return false;
  }
}

// typekit doesn't consider things which have properties as records
// even though they are?
export function isRecord(program: Program, type: Type): boolean {
  return type.kind === "Model" && !!type.indexer && type.indexer.key === $(program).builtin.string;
}

export function shouldReference(program: Program, type: Type): boolean {
  if (type.kind === "Scalar") {
    return isCustomScalar(program, type) && !ZOD_NATIVE_SCALARS.has(type.name);
  }
  return isDeclaration(program, type) && !isBuiltIn(program, type);
}

interface TypeCollector {
  collectType: (type: Type) => void;
  get types(): Type[];
}

export function newTopologicalTypeCollector(program: Program): TypeCollector {
  const types = new SCCSet<Type>(referencedTypes);

  function referencedTypes(type: Type): Type[] {
    switch (type.kind) {
      case "Model":
        return [
          ...(type.baseModel ? [type.baseModel] : []),
          ...(type.indexer ? [type.indexer.key, type.indexer.value] : []),
          ...[...walkPropertiesInherited(type)].map((p) => p.type),
        ];

      case "Union":
        return [...type.variants.values()].map((v) => (v.kind === "UnionVariant" ? v.type : v));
      case "UnionVariant":
        return [type.type];
      case "Interface":
        return [...type.operations.values()];
      case "Operation":
        return [type.parameters, type.returnType];
      case "Enum":
        return [];
      case "Scalar":
        return type.baseScalar ? [type.baseScalar] : [];
      case "Tuple":
        return type.values;
      case "Namespace":
        return [
          ...type.operations.values(),
          ...type.scalars.values(),
          ...type.models.values(),
          ...type.enums.values(),
          ...type.interfaces.values(),
          ...type.namespaces.values(),
        ];
      default:
        return [];
    }
  }

  return {
    collectType(type: Type) {
      if (shouldReference(program, type)) {
        types.add(type);
      }
    },
    get types() {
      return types.items;
    },
  };
}

export function call(target: string, ...args: Children[]) {
  return <FunctionCallExpression target={target} args={args} />;
}

export function memberExpr(...parts: Children[]) {
  return <MemberExpression children={parts} />;
}

export function zodMemberExpr(...parts: Children[]) {
  return memberExpr(refkeyPart(zod.z), ...parts);
}

export function idPart(id: string) {
  return <MemberExpression.Part id={id} />;
}

export function refkeyPart(refkey: Refkey) {
  return <MemberExpression.Part refkey={refkey} />;
}

export function callPart(target: string | Refkey, ...args: Children[]) {
  return (
    <MemberExpression>
      {typeof target === "string" ? idPart(target) : refkeyPart(target)}
      <MemberExpression.Part args={args} />
    </MemberExpression>
  );
}
