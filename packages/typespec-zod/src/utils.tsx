/**
 * Utility functions for the Zod emitter.
 */

import { Refkey } from "@alloy-js/core";
import { Children } from "@alloy-js/core/jsx-runtime";
import { FunctionCallExpression, MemberExpression } from "@alloy-js/typescript";
import { Model, ModelProperty, Program, Type } from "@typespec/compiler";
import { $ } from "@typespec/compiler/typekit";
import {
  getModelOwnProperties as ormGetModelOwnProperties,
  isBuiltIn,
  isCustomScalar,
} from "@qninhdt/typespec-orm";
export { isBuiltIn };
import { zod } from "./external-packages/zod.js";

const ownPropertiesCache = new WeakMap<Model, ModelProperty[]>();

/**
 * Memoized wrapper around `getModelOwnProperties`. The underlying call
 * walks the property map and filters; the cache avoids repeating that
 * work when the same model is rendered through multiple components
 * during a single emit.
 */
export function getModelOwnProperties(model: Model): ModelProperty[] {
  let cached = ownPropertiesCache.get(model);
  if (cached === undefined) {
    cached = ormGetModelOwnProperties(model).filter((prop) => !isCompositeScalar(prop.type));
    ownPropertiesCache.set(model, cached);
  }
  return cached;
}

function isCompositeScalar(type: Type): boolean {
  if (type.kind !== "Scalar") return false;
  let current: typeof type | undefined = type;
  while (current) {
    if (current.name === "composite") return true;
    current = current.baseScalar;
  }
  return false;
}

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
