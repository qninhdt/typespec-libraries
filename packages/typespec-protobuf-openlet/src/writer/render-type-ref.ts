import type { ProtoTypeRef } from "../types/scalars.js";

/**
 * Render a `ProtoTypeRef` as the proto type name string (e.g. `"int32"`,
 * `"openlet.user.v1.User"`, `"map<string, Foo>"`). Does NOT add the
 * `repeated` / `optional` prefix — those are handled at the field level
 * because they participate in field-presence semantics.
 *
 * For `repeated`, the function returns the ELEMENT type name. The caller is
 * responsible for prepending `repeated `.
 */
export function renderTypeRef(ref: ProtoTypeRef): string {
  switch (ref.kind) {
    case "scalar":
      return ref.name;
    case "wellKnown":
      return ref.name;
    case "message":
    case "enum":
      return ref.qualifiedName;
    case "repeated":
      return renderTypeRef(ref.element);
    case "map":
      return `map<${ref.key}, ${renderTypeRef(ref.value)}>`;
    case "any":
      return "google.protobuf.Any";
  }
}

/**
 * Surface the `importPath` (well-known message proto file) for a ref, if any.
 * Used by the file writer to assemble the imports block.
 */
export function getRefImportPath(ref: ProtoTypeRef): string | undefined {
  switch (ref.kind) {
    case "wellKnown":
      return ref.importPath;
    case "repeated":
      return getRefImportPath(ref.element);
    case "map":
      return getRefImportPath(ref.value);
    default:
      return undefined;
  }
}
