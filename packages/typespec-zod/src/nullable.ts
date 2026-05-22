/**
 * Detects whether a TypeSpec model property accepts `null`.
 *
 * TypeSpec encodes nullability as a `null` branch inside a union, e.g.
 * `field: string | null`, NOT as a separate "nullable" modifier (the
 * `?:` modifier is `optional`, which is independent — see `optional`
 * on `ModelProperty`).
 *
 * We treat ANY of these as nullable on the property:
 *   - the property's type is the intrinsic `null`
 *   - the property's type is a union containing a `null` intrinsic
 *   - the property's type is a union containing a `null` literal variant
 */
import type { ModelProperty, Type } from "@typespec/compiler";
import type { Typekit } from "@typespec/compiler/typekit";

export function isPropertyNullable($: Typekit, member: ModelProperty): boolean {
  return isNullableType($, member.type);
}

function isNullableType($: Typekit, type: Type): boolean {
  if (isNullType(type)) {
    return true;
  }
  if (type.kind === "Union") {
    for (const variant of type.variants.values()) {
      if (isNullType(variant.type)) return true;
    }
  }
  return false;
  // Note: $ is unused here today but kept on the signature so future
  // refinement (e.g. lookup-type unwrap, intersection) has access to
  // typekit without changing call sites.
  void $;
}

function isNullType(type: Type): boolean {
  return type.kind === "Intrinsic" && type.name === "null";
}
