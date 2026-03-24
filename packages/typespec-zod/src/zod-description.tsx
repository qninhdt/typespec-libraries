/**
 * Zod description - handles TypeSpec documentation and converts it to Zod describe().
 *
 * For lookup types (e.g., `inviteeEmail: User.email`), uses the member's doc
 * (the inline documentation) rather than the source property's doc.
 */

import { ModelProperty, Type } from "@typespec/compiler";
import { useTsp } from "@typespec/emitter-framework";
import { callPart, isBuiltIn } from "./utils.js";

export function zodDescriptionParts(type: Type, member?: ModelProperty) {
  const { $ } = useTsp();

  // For lookup types (type is ModelProperty), we prefer the member's doc
  // since it describes the specific use case (e.g., "Email of invitee")
  const sources: (Type | ModelProperty)[] = [];
  if (member && !isBuiltIn($.program, member)) {
    sources.push(member);
  }

  // Only add type if it's not a lookup type (ModelProperty)
  // For lookup types, we already have the member's doc which is more relevant
  if (!isBuiltIn($.program, type) && !$.modelProperty.is(type)) {
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
    const escapedDoc = doc.replaceAll(/\n+/g, " ").replaceAll('"', String.raw`\"`);
    return [callPart("describe", String.raw`"${escapedDoc}"`)];
  }

  return [];
}
