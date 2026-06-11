import type { ProtoTypeRef } from "../types/scalars.js";
import type { NamingContext } from "../walker/cross-package-refs.js";

/**
 * Render a `ProtoTypeRef` as the proto type name string (e.g. `"int32"`,
 * `"openlet.user.v1.User"`, `"map<string, Foo>"`). Does NOT add the
 * `repeated` / `optional` prefix — those are handled at the field level
 * because they participate in field-presence semantics.
 *
 * For `repeated`, the function returns the ELEMENT type name. The caller is
 * responsible for prepending `repeated `.
 *
 * When a {@link NamingContext} is supplied, message / enum references resolve
 * to the bare name (same-package) or qualified name (cross-package, recording
 * an import) via `ctx.nameFor`. Without a context, the ref's TypeSpec-form
 * `qualifiedName` is used (Phase 3 single-file behavior).
 */
export function renderTypeRef(ref: ProtoTypeRef, ctx?: NamingContext): string {
  switch (ref.kind) {
    case "scalar":
      return ref.name;
    case "wellKnown":
      return ref.name;
    case "message":
      return ctx ? ctx.nameFor(ref.model, ref.qualifiedName) : ref.qualifiedName;
    case "enum":
      return ctx ? ctx.nameFor(ref.enum, ref.qualifiedName) : ref.qualifiedName;
    case "repeated":
      return renderTypeRef(ref.element, ctx);
    case "map":
      return `map<${ref.key}, ${renderTypeRef(ref.value, ctx)}>`;
    case "any":
      return "google.protobuf.Any";
  }
}

/**
 * Surface the `importPath` (well-known message proto file) for a ref, if any.
 * Used by the file writer to assemble the imports block. Note: cross-package
 * message/enum imports come from the {@link NamingContext}, NOT this function.
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
