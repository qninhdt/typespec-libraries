import type { ProtoPackageSpec } from "../decorators-service.js";

export interface ProtoFileSections {
  /** Doc comment lines for the file header (already prefixed `//`). */
  header: string[];
  /** Proto package spec from `@package(...)`. */
  package: ProtoPackageSpec;
  /** Import paths surfaced by writers (deduped + sorted by this writer). */
  imports: string[];
  /** Pre-rendered body blocks (messages, enums, services), in declaration order. */
  bodyBlocks: string[][];
}

/**
 * Assemble a complete `.proto` file source.
 *
 * Layout:
 *   1. Optional file header comment.
 *   2. Emitter format-version comment (Red Team R4) — `// emitter: <name>@<ver>`.
 *      Phase 3 stamps a fixed marker; CI gate `make spec-version-check`
 *      uses this in Phase 8.
 *   3. `syntax = "proto3";`
 *   4. `package <name>;`
 *   5. Per-language options (`option go_package = "...";`, etc.).
 *   6. Imports (sorted alphabetically, deduped).
 *   7. Body blocks separated by single blank lines.
 */
export function renderProtoFile(sections: ProtoFileSections): string {
  const lines: string[] = [];

  if (sections.header.length > 0) {
    for (const h of sections.header) lines.push(h);
    lines.push("");
  }

  lines.push("// emitter: @qninhdt/typespec-protobuf@0");
  lines.push("");
  lines.push(`syntax = "proto3";`);
  lines.push("");
  lines.push(`package ${sections.package.name};`);
  lines.push("");

  const optionLines = renderOptions(sections.package);
  if (optionLines.length > 0) {
    for (const l of optionLines) lines.push(l);
    lines.push("");
  }

  const dedupedImports = Array.from(new Set(sections.imports)).sort();
  if (dedupedImports.length > 0) {
    for (const imp of dedupedImports) lines.push(`import "${imp}";`);
    lines.push("");
  }

  for (let i = 0; i < sections.bodyBlocks.length; i++) {
    const block = sections.bodyBlocks[i]!;
    for (const l of block) lines.push(l);
    if (i < sections.bodyBlocks.length - 1) lines.push("");
  }

  // Trailing newline so editors / git don't whine.
  return lines.join("\n") + "\n";
}

function renderOptions(spec: ProtoPackageSpec): string[] {
  const out: string[] = [];
  const d = spec.details;
  if (d.goPackage) out.push(`option go_package = "${d.goPackage}";`);
  if (d.javaPackage) out.push(`option java_package = "${d.javaPackage}";`);
  if (d.javaOuterClassname) out.push(`option java_outer_classname = "${d.javaOuterClassname}";`);
  if (d.javaMultipleFiles !== undefined)
    out.push(`option java_multiple_files = ${d.javaMultipleFiles};`);
  if (d.csharpNamespace) out.push(`option csharp_namespace = "${d.csharpNamespace}";`);
  if (d.phpNamespace) out.push(`option php_namespace = "${d.phpNamespace}";`);
  if (d.rubyPackage) out.push(`option ruby_package = "${d.rubyPackage}";`);
  if (d.options) {
    for (const [key, value] of Object.entries(d.options)) {
      out.push(`option ${key} = ${formatOptionValue(value)};`);
    }
  }
  return out;
}

function formatOptionValue(v: string | number | boolean): string {
  if (typeof v === "string") return `"${v}"`;
  return String(v);
}
