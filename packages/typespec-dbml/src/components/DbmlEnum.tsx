/**
 * DbmlEnum - DBML enum generation.
 */

import type { EnumMemberInfo } from "@qninhdt/typespec-orm";

export function generateEnumDefinition(enumName: string, members: EnumMemberInfo[]): string {
  let code = `Enum ${enumName} {\n`;

  for (const member of members) {
    // DBML uses the member name as the value
    code += `  ${member.name}\n`;
  }

  code += "}";

  return code;
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
