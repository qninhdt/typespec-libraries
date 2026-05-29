import type { Enum, EnumMember, Program } from "@typespec/compiler";
import { getDoc, isDeprecated } from "@typespec/compiler";
import { camelToProtoSnake } from "./snake-case.js";
import { renderProtoComment } from "./proto-comment.js";
import { getProtoReservations } from "../state-accessors.js";
import type { ProtoReservation } from "../decorators-message.js";

export interface EnumDiagnostic {
  code: string;
  target: Enum | EnumMember;
  args: Record<string, string | number>;
}

export interface EnumRenderResult {
  lines: string[];
  diagnostics: EnumDiagnostic[];
}

/**
 * Render an enum declaration. Enum members get UPPER_SNAKE_CASE names by
 * convention; explicit numeric values are required (TypeSpec implicit
 * ordering is unsafe across renames). proto3 requires the first member's
 * value to be 0; the writer enforces this with a diagnostic.
 */
export function renderProtoEnum(program: Program, e: Enum): EnumRenderResult {
  const lines: string[] = [];
  const diagnostics: EnumDiagnostic[] = [];

  for (const line of renderProtoComment(getDoc(program, e))) lines.push(line);
  lines.push(`enum ${e.name} {`);

  if (isDeprecated(program, e)) {
    lines.push("  option deprecated = true;");
  }

  for (const r of getProtoReservations(program, e)) {
    lines.push(`  ${renderReservation(r)};`);
  }

  const members = Array.from(e.members.values());
  if (members.length === 0) {
    diagnostics.push({
      code: "enum-zero-value-required",
      target: e,
      args: { enumName: e.name },
    });
  }

  let firstValue: number | undefined;
  for (let i = 0; i < members.length; i++) {
    const m = members[i]!;
    const value = pickEnumValue(m, i);
    if (i === 0) firstValue = value;
    const name = camelToProtoUpper(m.name);
    const memberDoc = getDoc(program, m);
    for (const line of renderProtoComment(memberDoc, { indent: "  " })) lines.push(line);
    const deprecatedTail = isDeprecated(program, m) ? " [deprecated = true]" : "";
    lines.push(`  ${name} = ${value}${deprecatedTail};`);
  }

  if (members.length > 0 && firstValue !== 0) {
    diagnostics.push({
      code: "enum-zero-value-required",
      target: e,
      args: { enumName: e.name },
    });
  }

  lines.push("}");
  return { lines, diagnostics };
}

function pickEnumValue(m: EnumMember, fallbackIndex: number): number {
  if (typeof m.value === "number") return m.value;
  return fallbackIndex;
}

/**
 * Convert a TypeSpec enum member name to proto's UPPER_SNAKE convention.
 * `unspecified` → `UNSPECIFIED`, `bandwidthLimit` → `BANDWIDTH_LIMIT`.
 */
function camelToProtoUpper(name: string): string {
  return camelToProtoSnake(name).toUpperCase();
}

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
