/**
 * Builds the per-property `Meta` object literal for `ZodModelFile`.
 *
 * The schema (`*Schema`) carries runtime validation; the metadata (`*Meta`)
 * carries UI/display hints (titles, placeholders, descriptions, numeric
 * bounds, regex, format, secret, multiline, required). This module
 * centralizes the field shape — the typed `FormFieldMeta` interface —
 * so every emitted file declares the same contract.
 */
import type { ModelProperty, Program, Type } from "@typespec/compiler";
import { getFormat, getPattern, isSecret } from "@typespec/compiler";
import {
  getDoc,
  getInputTypeForProperty,
  getMaxValue,
  getMinValue,
  getPlaceholder,
  getTitle,
} from "@qninhdt/typespec-orm";

export const FORM_FIELD_META_INTERFACE_NAME = "FormFieldMeta";

/**
 * Build a single `{ ... }` literal describing one property. Returns
 * `undefined` when the property has no metadata at all (e.g. an internal
 * field with no decorators). Output deliberately omits empty keys —
 * downstream code can treat absence as "not provided".
 */
export function buildMetaEntry(program: Program, prop: ModelProperty): string | undefined {
  const parts: string[] = [];

  const title = getTitle(program, prop);
  if (title !== undefined) parts.push(`title: ${JSON.stringify(title)}`);

  const placeholder = getPlaceholder(program, prop);
  if (placeholder !== undefined) parts.push(`placeholder: ${JSON.stringify(placeholder)}`);

  const description = getDoc(program, prop);
  if (description !== undefined) parts.push(`description: ${JSON.stringify(description)}`);

  const min = getMinValue(program, prop);
  if (min !== undefined) parts.push(`min: ${min}`);

  const max = getMaxValue(program, prop);
  if (max !== undefined) parts.push(`max: ${max}`);

  const multipleOf = getMultipleOfFromProperty(prop);
  if (multipleOf !== undefined) parts.push(`multipleOf: ${multipleOf}`);

  const pattern = getPattern(program, prop);
  if (pattern !== undefined) parts.push(`regex: ${JSON.stringify(pattern)}`);

  const format = getFormat(program, prop);
  if (format !== undefined) parts.push(`format: ${JSON.stringify(format)}`);

  const inputType = getInputTypeForProperty(program, prop);
  if (inputType !== undefined) parts.push(`inputType: ${JSON.stringify(inputType)}`);

  if (isSecret(program, prop)) parts.push(`secret: true`);

  // `multiline: true` falls out of `@format("textarea")` — a common
  // convention used by other emitters in this monorepo. We don't invent
  // a new decorator just for this signal.
  if (format === "textarea") parts.push(`multiline: true`);

  // `required` is the negation of TypeSpec's `optional` modifier. Emit
  // it explicitly so consumers don't have to special-case the absence of
  // a key in the meta object.
  parts.push(`required: ${prop.optional ? "false" : "true"}`);

  // If the only field we collected is `required`, the property is plain:
  // skip the entry entirely so meta objects stay terse.
  if (parts.length === 1 && parts[0].startsWith("required:")) {
    return undefined;
  }

  return `{ ${parts.join(", ")} }`;
}

/**
 * Source for the typed `FormFieldMeta` interface emitted once per file
 * (declared as a top-level `interface` so consumers can `import { FormFieldMeta }`
 * the shape rather than relying on `typeof Meta`).
 */
export const FORM_FIELD_META_INTERFACE_SOURCE = `interface ${FORM_FIELD_META_INTERFACE_NAME} {
  title?: string;
  placeholder?: string;
  description?: string;
  min?: number;
  max?: number;
  regex?: string;
  format?: string;
  required?: boolean;
  multipleOf?: number;
  multiline?: boolean;
  secret?: boolean;
  inputType?: string;
}`;

/**
 * Read `@multipleOf(value)` off a property or its scalar type. The decorator
 * lives in `@typespec/json-schema`, so we don't import a typed accessor;
 * instead we walk the decorator list by name. Property decorator wins, then
 * the scalar's own decorator, then base scalars.
 */
function getMultipleOfFromProperty(prop: ModelProperty): number | undefined {
  const fromProp = readMultipleOfFromType(prop);
  if (fromProp !== undefined) return fromProp;
  let t: Type | undefined = prop.type;
  while (t && t.kind === "Scalar") {
    const v = readMultipleOfFromType(t);
    if (v !== undefined) return v;
    t = t.baseScalar;
  }
  return undefined;
}

function readMultipleOfFromType(source: Type): number | undefined {
  const decorators = (source as { decorators?: unknown }).decorators;
  if (!Array.isArray(decorators)) return undefined;
  for (const dec of decorators as Array<{
    definition?: { name?: string };
    decorator?: { name?: string };
    args?: ReadonlyArray<{ jsValue?: unknown }>;
  }>) {
    const name = dec.definition?.name ?? dec.decorator?.name ?? "";
    if (name !== "@multipleOf" && name !== "$multipleOf") continue;
    const arg = dec.args?.[0];
    if (!arg) continue;
    const js = arg.jsValue;
    if (typeof js === "number") return js;
    if (typeof js === "bigint") return Number(js);
    if (js && typeof js === "object" && "asNumber" in js) {
      const n = (js as { asNumber: () => number | null }).asNumber();
      if (typeof n === "number") return n;
    }
  }
  return undefined;
}
