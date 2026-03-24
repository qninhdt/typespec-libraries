/**
 * Constants and type maps used by GORM code generation components.
 * Pure data -no JSX needed.
 */

import type { EnumMemberInfo } from "@qninhdt/typespec-orm";
import { camelToPascal, camelToSnake } from "@qninhdt/typespec-orm";

/** Maps canonical DB type names → Go types, GORM column types, and required imports */
export const GO_TYPE_MAP: Record<string, { goType: string; gormType: string; imports?: string[] }> =
  {
    uuid: {
      goType: "uuid.UUID",
      gormType: "uuid",
      imports: ["github.com/google/uuid"],
    },
    string: { goType: "string", gormType: "varchar(255)" },
    text: { goType: "string", gormType: "text" },
    boolean: { goType: "bool", gormType: "boolean" },
    int8: { goType: "int8", gormType: "smallint" },
    int16: { goType: "int16", gormType: "smallint" },
    int32: { goType: "int32", gormType: "integer" },
    int64: { goType: "int64", gormType: "bigint" },
    uint8: { goType: "uint8", gormType: "smallint" },
    uint16: { goType: "uint16", gormType: "integer" },
    uint32: { goType: "uint32", gormType: "bigint" },
    uint64: { goType: "uint64", gormType: "bigint" },
    float32: { goType: "float32", gormType: "real" },
    float64: { goType: "float64", gormType: "double precision" },
    decimal: {
      goType: "decimal.Decimal",
      gormType: "numeric",
      imports: ["github.com/shopspring/decimal"],
    },
    serial: { goType: "int32", gormType: "serial" },
    bigserial: { goType: "int64", gormType: "bigserial" },
    utcDateTime: {
      goType: "time.Time",
      gormType: "timestamptz",
      imports: ["time"],
    },
    date: { goType: "time.Time", gormType: "date", imports: ["time"] },
    time: { goType: "time.Time", gormType: "time", imports: ["time"] },
    duration: {
      goType: "time.Duration",
      gormType: "interval",
      imports: ["time"],
    },
    bytes: { goType: "[]byte", gormType: "bytea" },
    jsonb: {
      goType: "datatypes.JSON",
      gormType: "jsonb",
      imports: ["gorm.io/datatypes"],
    },
  };

/** Maps @format values → go-playground/validator v10 tag names */
export const GO_FORMAT_VALIDATORS: Record<string, string> = {
  email: "email",
  uri: "url",
  url: "url",
  uuid: "uuid",
  ipv4: "ipv4",
  ipv6: "ipv6",
  ip: "ip",
  cidr: "cidr",
  mac: "mac",
  base64: "base64",
  hostname: "hostname",
  latitude: "latitude",
  longitude: "longitude",
};

export interface CompositeFieldTag {
  kind: "index" | "uniqueIndex" | "primaryIndex";
  name: string;
  priority: number;
}

/**
 * Escape characters that are unsafe inside a Go struct tag value.
 */
export function escapeFormTagValue(value: string): string {
  return value.replaceAll("`", "'").replaceAll(",", " ");
}

/**
 * Escape characters in doc comments for safe inclusion in Go tags.
 */
export function escapeComment(doc: string): string {
  return doc.replaceAll(";", ",").replaceAll('"', "'").replaceAll("`", "'");
}

/**
 * Build a doc comment line from documentation text.
 */
export function buildDocComment(doc: string | undefined): string {
  return doc ? `\t// ${doc}\n` : "";
}

export interface GoPackageImport {
  alias: string;
  path: string;
}

/**
 * Build Go import block from a set of import paths.
 */
export function buildImportBlock(
  imports: Set<string>,
  packageImports: GoPackageImport[] = [],
): string {
  const sorted = [...imports].sort();
  if (sorted.length === 0 && packageImports.length === 0) return "";
  const stdImports = sorted.filter((i) => !i.includes("."));
  const extImports = sorted.filter((i) => i.includes("."));
  const parts: string[] = [];
  parts.push("import (");
  for (const imp of stdImports) parts.push(`\t"${imp}"`);
  if (stdImports.length > 0 && (extImports.length > 0 || packageImports.length > 0)) parts.push("");
  for (const imp of extImports) parts.push(`\t"${imp}"`);
  if (extImports.length > 0 && packageImports.length > 0) parts.push("");
  for (const imp of packageImports.sort((a, b) => a.alias.localeCompare(b.alias))) {
    parts.push(`\t${imp.alias} "${imp.path}"`);
  }
  parts.push(")");
  return parts.join("\n") + "\n";
}

/**
 * Build a lookup from column name → composite index/unique tags for that field.
 * Uses composite<> type syntax: composite<field1, field2>
 * Note: Uses snake_case keys to match database column names.
 */
export function buildCompositeMap(
  compositeTypes?: { name: string; columns: string[]; isUnique: boolean; isPrimary: boolean }[],
): Map<string, CompositeFieldTag[]> {
  const map = new Map<string, CompositeFieldTag[]>();

  if (!compositeTypes) return map;

  for (const ct of compositeTypes) {
    let kind: CompositeFieldTag["kind"] = "index";
    if (ct.isPrimary) {
      kind = "primaryIndex";
    } else if (ct.isUnique) {
      kind = "uniqueIndex";
    }

    for (let i = 0; i < ct.columns.length; i++) {
      const snakeCol = camelToSnake(ct.columns[i]);
      const tags = map.get(snakeCol) ?? [];
      tags.push({ kind, name: ct.name, priority: i + 1 });
      map.set(snakeCol, tags);
    }
  }

  return map;
}

/**
 * Generate Go enum type + const block lines for a set of enum types.
 * Shared between GormStruct and GormDataStruct to avoid duplication.
 */
export function buildGoEnumBlock(enumTypes: Map<string, EnumMemberInfo[]>): string[] {
  const lines: string[] = [];
  for (const [enumName, members] of enumTypes) {
    const goTypeName = camelToPascal(enumName);
    lines.push(`// ${goTypeName} represents the ${camelToSnake(enumName)} enum.`);
    lines.push(`type ${goTypeName} string`);
    lines.push("");
    lines.push("const (");
    for (const m of members) {
      const constName = `${goTypeName}${camelToPascal(m.name)}`;
      lines.push(`\t${constName} ${goTypeName} = "${m.value}"`);
    }
    lines.push(")");
    lines.push("");
  }
  return lines;
}
