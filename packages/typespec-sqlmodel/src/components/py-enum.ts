import type { EnumMemberInfo } from "@qninhdt/typespec-orm";
import { camelToSnake } from "@qninhdt/typespec-orm";
import { FOUR_SPACES, pythonTripleQuotedString, pythonStringLiteral } from "./py-field-utils.js";

export function generateEnumClass(enumName: string, members: EnumMemberInfo[]): string {
  const numeric = members.length > 0 && members.every((m) => m.valueKind === "number");
  let code = `class ${enumName}(${numeric ? "int" : "str"}, Enum):\n`;
  code += `${FOUR_SPACES}${pythonTripleQuotedString(`Auto-generated enum for ${camelToSnake(enumName)}.`)}\n\n`;
  for (const m of members) {
    const value = numeric ? String(m.rawValue) : pythonStringLiteral(m.value);
    code += `${FOUR_SPACES}${camelToSnake(m.name)} = ${value}\n`;
  }
  return code;
}
