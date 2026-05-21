import type { Enum, Program } from "@typespec/compiler";
import { getEnumMembers } from "@qninhdt/typespec-orm";
import { reportDiagnostic } from "./lib.js";

export interface ProtoEnum {
  name: string;
  members: ProtoEnumMember[];
}

export interface ProtoEnumMember {
  name: string;
  value: number;
}

export function camelToUpperSnake(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1_$2")
    .toUpperCase();
}

export function resolveProtoEnum(program: Program, enumType: Enum): ProtoEnum {
  const members = getEnumMembers(enumType);
  const protoMembers: ProtoEnumMember[] = [];

  const allNumeric = members.every((m) => m.valueKind === "number");
  const allString = members.every((m) => m.valueKind === "string");

  if (!allNumeric && !allString) {
    reportDiagnostic(program, {
      code: "proto-enum-mixed-values",
      target: enumType,
    });
    return { name: enumType.name, members: [] };
  }

  if (allNumeric) {
    for (const member of members) {
      protoMembers.push({
        name: camelToUpperSnake(member.name),
        value: member.rawValue as number,
      });
    }
  } else {
    for (let i = 0; i < members.length; i++) {
      protoMembers.push({
        name: camelToUpperSnake(members[i].name),
        value: i,
      });
    }
  }

  const hasZero = protoMembers.some((m) => m.value === 0);
  if (!hasZero) {
    reportDiagnostic(program, {
      code: "proto-enum-missing-zero",
      target: enumType,
    });
    const prefix = camelToUpperSnake(enumType.name);
    protoMembers.unshift({ name: `${prefix}_UNSPECIFIED`, value: 0 });
  }

  return { name: enumType.name, members: protoMembers };
}
