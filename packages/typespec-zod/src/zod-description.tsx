/**
 * Zod description - handles TypeSpec documentation and converts it to Zod describe().
 *
 * For lookup types (e.g., `inviteeEmail: User.email`), uses the member's doc
 * (the inline documentation) rather than the source property's doc.
 */

import { ModelProperty, Type } from "@typespec/compiler";
import { useTsp } from "@typespec/emitter-framework";
import { getOrmScalarName } from "@qninhdt/typespec-orm";
import { callPart, isBuiltIn } from "./utils.js";

/**
 * Names of scalars whose intrinsic TSDoc should never leak into emitted
 * `.describe(...)` calls. Includes Zod-native validators and built-in
 * numeric/temporal scalars whose TSDoc is library-internal (e.g. ORM
 * implementation notes about PostgreSQL columns), not user-facing docs
 * about a specific field.
 */
const BUILTIN_SCALAR_DOC_SUPPRESS = new Set([
  // Zod-native string scalars
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
  // ISO temporal scalars
  "plainDate",
  "plainTime",
  "utcDateTime",
  "offsetDateTime",
  "duration",
  // Numeric primitives
  "int8",
  "int16",
  "int32",
  "int64",
  "uint8",
  "uint16",
  "uint32",
  "uint64",
  "safeint",
  "integer",
  "numeric",
  "float",
  "float32",
  "float64",
  "decimal",
  "decimal128",
]);

export function zodDescriptionParts(type: Type, member?: ModelProperty) {
  const { $ } = useTsp();

  // For lookup types (type is ModelProperty), we prefer the member's doc
  // since it describes the specific use case (e.g., "Email of invitee")
  const sources: (Type | ModelProperty)[] = [];
  if (member && !isBuiltIn($.program, member)) {
    sources.push(member);
  }

  // Only add type if it's not a lookup type (ModelProperty)
  // For lookup types, we already have the member's doc which is more relevant.
  // Skip ORM semantic scalars and built-in TypeSpec scalars whose TSDoc is
  // library-internal, not user-facing.
  if (
    !isBuiltIn($.program, type) &&
    !$.modelProperty.is(type) &&
    getOrmScalarName(type) === undefined &&
    !(type.kind === "Scalar" && BUILTIN_SCALAR_DOC_SUPPRESS.has(type.name))
  ) {
    sources.push(type);
  }

  let doc: string | undefined;
  for (const source of sources) {
    const sourceDoc = $.type.getDoc(source);

    if (sourceDoc) {
      doc = sourceDoc;
      break;
    }
  }

  if (doc) {
    const escapedDoc = doc.replaceAll(/\n+/g, " ");
    return [callPart("describe", JSON.stringify(escapedDoc))];
  }

  return [];
}
