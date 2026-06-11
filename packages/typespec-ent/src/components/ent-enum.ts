import type { EnumMemberInfo } from "@qninhdt/typespec-orm";
import { camelToPascal, camelToSnake } from "@qninhdt/typespec-orm";
import { goStringLiteral } from "./ent-string-utils.js";

export function buildGoEnumBlock(enumTypes: Map<string, EnumMemberInfo[]>): string[] {
  const lines: string[] = [];
  for (const [enumName, members] of enumTypes) {
    const goTypeName = camelToPascal(enumName);
    const numeric = members.length > 0 && members.every((m) => m.valueKind === "number");
    const primitiveType = numeric ? "int32" : "string";
    lines.push(
      `// ${goTypeName} represents the ${camelToSnake(enumName)} enum.`,
      `type ${goTypeName} ${primitiveType}`,
      "",
      "const (",
    );
    for (const m of members) {
      const constName = `${goTypeName}${camelToPascal(m.name)}`;
      const value = numeric ? String(m.rawValue) : goStringLiteral(m.value);
      lines.push(`\t${constName} ${goTypeName} = ${value}`);
    }
    lines.push(")", "");
  }
  return lines;
}
