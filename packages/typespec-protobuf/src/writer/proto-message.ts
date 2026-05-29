import type { Model, ModelProperty, Program } from "@typespec/compiler";
import { getDoc, isDeprecated } from "@typespec/compiler";
import { isIgnored as isOrmIgnored } from "@qninhdt/typespec-orm";
import {
  getProtoFieldNumber,
  getProtoFieldName,
  getProtoMessageOverrideName,
  getProtoOneof,
  getProtoReservations,
  isProtoIgnored,
  getProtoGoType,
} from "../state-accessors.js";
import {
  resolveProtoType,
  type ResolveProtoTypeOptions,
  type ProtoTypeResolutionWarning,
} from "../types/resolver.js";
import type { ProtoReservation } from "../decorators-message.js";
import type { ProtoTypeRef } from "../types/scalars.js";
import type { NamingContext } from "../walker/cross-package-refs.js";
import { renderTypeRef, getRefImportPath } from "./render-type-ref.js";
import { renderProtoComment } from "./proto-comment.js";
import { camelToProtoSnake } from "./snake-case.js";

/**
 * Diagnostic raised by the message writer that the emitter shell translates
 * into a real compiler diagnostic. `target` carries the property the
 * diagnostic is attached to.
 */
export interface MessageDiagnostic {
  code: string;
  target: ModelProperty | Model;
  args: Record<string, string | number>;
}

export interface MessageRenderResult {
  /** Lines of the rendered `message Foo { ... }` block, no trailing newline. */
  lines: string[];
  /** Import paths surfaced by field types; the file writer dedupes + sorts. */
  imports: string[];
  /** Diagnostics raised during render. */
  diagnostics: MessageDiagnostic[];
}

export interface MessageRenderOptions {
  fieldNameStyle?: "snake_case" | "camelCase" | "preserve";
  resolverOptions?: ResolveProtoTypeOptions;
  /** Cross-package naming context (Phase 4). When set, type refs resolve to
   *  bare (same-package) or qualified (cross-package) names and accrue
   *  imports. When absent, refs use TypeSpec-form qualified names. */
  naming?: NamingContext;
}

/**
 * Render one `@message` model as a proto message block.
 */
export function renderProtoMessage(
  program: Program,
  model: Model,
  opts: MessageRenderOptions = {},
): MessageRenderResult {
  const fieldNameStyle = opts.fieldNameStyle ?? "snake_case";
  const messageName = getProtoMessageOverrideName(program, model) ?? model.name;
  const lines: string[] = [];
  const imports: string[] = [];
  const diagnostics: MessageDiagnostic[] = [];

  // Doc comment.
  const doc = getDoc(program, model);
  for (const line of renderProtoComment(doc)) lines.push(line);

  lines.push(`message ${messageName} {`);

  // Deprecation option.
  if (isDeprecated(program, model)) {
    lines.push("  option deprecated = true;");
  }

  // Reservations.
  for (const r of getProtoReservations(program, model)) {
    lines.push(`  ${renderReservation(r)};`);
  }

  // Fields. Group oneof members by group name (preserving declaration order).
  const oneofGroups = new Map<string, Array<{ prop: ModelProperty; line: string }>>();
  const inheritedSkip = new Set<ModelProperty>();
  for (const prop of model.properties.values()) {
    if (isProtoIgnored(program, prop)) continue;
    // ORM-only columns (@Qninhdt.Orm.ignore) have no proto representation.
    // Safe to call on non-entity messages: returns false when the orm state
    // map has no entry for the property.
    if (isOrmIgnored(program, prop)) continue;
    if (inheritedSkip.has(prop)) continue;

    const fieldNumber = getProtoFieldNumber(program, prop);
    if (fieldNumber === undefined) {
      diagnostics.push({
        code: "field-number-required",
        target: prop,
        args: { propertyName: prop.name, messageName },
      });
      continue;
    }

    const resolution = resolveProtoType(program, prop, opts.resolverOptions ?? {});
    for (const w of resolution.warnings) {
      diagnostics.push(translateResolverWarning(w, prop, messageName));
    }
    const importPath = getRefImportPath(resolution.ref);
    if (importPath) imports.push(importPath);

    const fieldName = pickFieldName(program, prop, fieldNameStyle);
    const fieldLine = renderField(
      prop,
      resolution.ref,
      fieldName,
      fieldNumber,
      program,
      opts.naming,
    );
    // Field-level doc comment (leading // lines). Preserves the RFC URNs and
    // field semantics authors put on proto fields.
    const fieldDoc = renderProtoComment(getDoc(program, prop), { indent: "  " });
    const oneofName = getProtoOneof(program, prop);

    if (oneofName) {
      const arr = oneofGroups.get(oneofName) ?? [];
      arr.push({ prop, line: fieldLine });
      oneofGroups.set(oneofName, arr);
    } else {
      for (const d of fieldDoc) lines.push(d);
      lines.push(`  ${fieldLine}`);
    }
  }

  // Emit oneof blocks AFTER plain fields, in oneof-group declaration order.
  for (const [groupName, members] of oneofGroups) {
    if (members.length < 2) {
      diagnostics.push({
        code: "oneof-empty-group",
        target: members[0]?.prop ?? model,
        args: { oneofName: groupName, messageName },
      });
    }
    lines.push(`  oneof ${groupName} {`);
    for (const { prop, line } of members) {
      // Re-render at the deeper oneof indent (4 spaces).
      for (const d of renderProtoComment(getDoc(program, prop), { indent: "    " })) {
        lines.push(d);
      }
      lines.push(`    ${line}`);
    }
    lines.push("  }");
  }

  lines.push("}");
  // Merge cross-package imports accrued via the naming context (Phase 4).
  if (opts.naming) {
    for (const imp of opts.naming.imports) imports.push(imp);
  }
  return { lines, imports, diagnostics };
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function renderReservation(r: ProtoReservation): string {
  switch (r.kind) {
    case "index":
      return `reserved ${r.value}`;
    case "range":
      return `reserved ${r.start} to ${r.end}`;
    case "name":
      return `reserved "${r.value}"`;
  }
}

function pickFieldName(
  program: Program,
  prop: ModelProperty,
  style: "snake_case" | "camelCase" | "preserve",
): string {
  const explicit = getProtoFieldName(program, prop);
  if (explicit) return explicit;
  if (style === "preserve") return prop.name;
  if (style === "camelCase") return prop.name;
  return camelToProtoSnake(prop.name);
}

function renderField(
  prop: ModelProperty,
  ref: ProtoTypeRef,
  fieldName: string,
  fieldNumber: number,
  program: Program,
  naming?: NamingContext,
): string {
  const parts: string[] = [];
  const isRepeated = ref.kind === "repeated";
  const isMap = ref.kind === "map";

  // proto3 explicit-presence (`optional` keyword) for nullable scalars and
  // message references. Maps / repeated are never `optional`.
  const isOptionalNullable = prop.optional && !isRepeated && !isMap;

  if (isRepeated) parts.push("repeated");
  if (isOptionalNullable) parts.push("optional");

  parts.push(renderTypeRef(ref, naming));
  parts.push(fieldName);
  parts.push("=");
  parts.push(`${fieldNumber}`);

  // Field-level options. Currently only @goType + @deprecated.
  const opts: string[] = [];
  const goType = getProtoGoType(program, prop);
  if (goType && goType.raw !== "" && goType.importPath !== "") {
    opts.push(`(go.type) = "${goType.raw}"`);
  }
  if (isDeprecated(program, prop)) {
    opts.push("deprecated = true");
  }

  let line = `${parts.join(" ")}`;
  if (opts.length > 0) {
    line += ` [${opts.join(", ")}]`;
  }
  return `${line};`;
}

function translateResolverWarning(
  w: ProtoTypeResolutionWarning,
  prop: ModelProperty,
  messageName: string,
): MessageDiagnostic {
  switch (w.kind) {
    case "unknown-type":
      return {
        code: "unknown-type-fallback",
        target: prop,
        args: { propertyName: prop.name, messageName, typeName: w.typeName },
      };
    case "storage-only-scalar":
      return {
        code: "storage-only-scalar-on-wire",
        target: prop,
        args: { propertyName: prop.name, messageName, scalarName: w.scalarName },
      };
    case "anonymous-model":
      return {
        code: "anonymous-model-on-wire",
        target: prop,
        args: { propertyName: prop.name, messageName },
      };
    case "invalid-map-key":
      return {
        code: "invalid-map-key",
        target: prop,
        args: { propertyName: prop.name, messageName, keyTypeName: w.keyTypeName },
      };
    case "nested-map":
      return {
        code: "nested-map-rejected",
        target: prop,
        args: { propertyName: prop.name, messageName },
      };
  }
}
