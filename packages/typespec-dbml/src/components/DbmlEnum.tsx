/**
 * DbmlEnum - DBML enum generation.
 */

import type { EnumMemberInfo } from "@qninhdt/typespec-orm";

export function generateEnumDefinition(enumName: string, members: EnumMemberInfo[]): string {
  return [`Enum ${enumName} {`, ...members.map((member) => `  ${member.name}`), "}"].join("\n");
}

/**
 * Generate all enum definitions for a program.
 */
export function generateEnumDefinitions(enums: Map<string, EnumMemberInfo[]>): string[] {
  const results: string[] = [];

  for (const [enumName, members] of enums) {
    results.push(generateEnumDefinition(enumName, members));
  }

  return results;
}
