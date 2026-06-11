import type { DecoratorContext, ModelProperty } from "@typespec/compiler";
import { IgnoreKey, RenameKey, GoTypeKey, MapKey } from "./lib.js";

/**
 * Resolved Go binding override on a proto field. Mirrors the shape used by
 * `@qninhdt/typespec-orm`'s `GoTypeSpec` so emitters that bridge ORM ↔ proto
 * can share the same shape without conversion.
 */
export interface ProtoGoTypeSpec {
  importPath: string;
  typeName: string;
  raw: string;
}

/**
 * Resolved `@map` override that forces emission as `map<K, V>` regardless of
 * the property's TypeSpec type.
 */
export interface ProtoMapSpec {
  key: string;
  value: string;
}

/**
 * Drops a property from proto emit. Phase 5's allocator additionally moves the
 * dropped field number into the model's `_reserved` set so it can never be
 * silently reused by a later author.
 *
 * **Name collision policy:** `@qninhdt/typespec-orm` also exports `@ignore`.
 * When both libraries are in scope, bare `@ignore` becomes ambiguous — qualify
 * as `@Openlet.Proto.ignore`.
 */
export function $ignore(context: DecoratorContext, target: ModelProperty): void {
  context.program.stateMap(IgnoreKey).set(target, true);
}

/**
 * Overrides the auto-generated snake_case proto field name. Stored verbatim;
 * the emitter (Phase 3) uses this value instead of running the snake_case
 * algorithm on the property's TypeSpec name.
 */
export function $rename(context: DecoratorContext, target: ModelProperty, name: string): void {
  context.program.stateMap(RenameKey).set(target, name);
}

/**
 * Overrides the Go binding type emitted for a proto field. The argument is a
 * fully-qualified Go import path + symbol name separated by a dot, e.g.
 * `"github.com/openlet/file-service/internal/file.Metadata"`.
 *
 * The split point is the LAST dot before the symbol so dotted package paths
 * (like `github.com/foo/bar/v2.MyType`) still parse correctly. When the input
 * lacks a usable dot, the spec is stored with empty `importPath` /
 * `typeName` and the raw value preserved — the emitter validates and reports.
 */
export function $goType(
  context: DecoratorContext,
  target: ModelProperty,
  importPathAndType: string,
): void {
  const lastDot = importPathAndType.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === importPathAndType.length - 1) {
    context.program.stateMap(GoTypeKey).set(target, {
      importPath: "",
      typeName: "",
      raw: importPathAndType,
    } satisfies ProtoGoTypeSpec);
    return;
  }
  const importPath = importPathAndType.slice(0, lastDot);
  const typeName = importPathAndType.slice(lastDot + 1);
  context.program.stateMap(GoTypeKey).set(target, {
    importPath,
    typeName,
    raw: importPathAndType,
  } satisfies ProtoGoTypeSpec);
}

/**
 * Forces emission of the property as `map<K, V>`. Both `key` and `value` are
 * proto type names rendered verbatim by the emitter.
 */
export function $map(
  context: DecoratorContext,
  target: ModelProperty,
  key: string,
  value: string,
): void {
  context.program.stateMap(MapKey).set(target, { key, value } satisfies ProtoMapSpec);
}
