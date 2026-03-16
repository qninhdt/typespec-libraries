/**
 * DBML type mappings and constants.
 */

import type { Program, Type, Scalar } from "@typespec/compiler";
import { resolveDbType } from "@qninhdt/typespec-orm";

/**
 * Map TypeSpec types to DBML types.
 */
export const DBML_TYPE_MAP: Record<string, string> = {
  uuid: "uuid",
  string: "varchar",
  text: "text",
  boolean: "boolean",
  int8: "integer",
  int16: "integer",
  int32: "integer",
  int64: "bigint",
  uint8: "integer",
  uint16: "integer",
  uint32: "bigint",
  uint64: "bigint",
  float32: "float",
  float64: "double",
  decimal: "decimal",
  serial: "serial",
  bigserial: "bigserial",
  utcDateTime: "timestamp",
  date: "date",
  time: "time",
  duration: "interval",
  bytes: "blob",
  jsonb: "jsonb",
};

/**
 * Get DBML type for a TypeSpec type.
 */
export function getDbmlType(program: Program, type: Type): string | undefined {
  // Handle scalar types
  if (type.kind === "Scalar") {
    const dbType = resolveDbType(type);
    if (dbType) {
      return DBML_TYPE_MAP[dbType];
    }
    // For custom scalars, try using the name
    const scalarName = (type as Scalar).name;
    if (scalarName) {
      return DBML_TYPE_MAP[scalarName];
    }
  }

  // Handle built-in types
  const typeName = type.kind.toLowerCase();
  return DBML_TYPE_MAP[typeName];
}

/**
 * Format a DBML column definition with settings.
 */
export interface ColumnSettings {
  pk?: boolean;
  notNull?: boolean;
  unique?: boolean;
  increment?: boolean;
  default?: string;
  note?: string;
}

export function formatColumnSettings(settings: ColumnSettings): string {
  const parts: string[] = [];

  if (settings.pk) parts.push("pk");
  if (settings.increment) parts.push("increment");
  if (settings.notNull) parts.push("not null");
  if (settings.unique) parts.push("unique");
  if (settings.default) parts.push(`default: '${settings.default}'`);
  if (settings.note)
    parts.push(
      `note: '${settings.note.replace(/'/g, "").replace(/"/g, "").replace(/`/g, "").replace(/\n/g, " ")}'`,
    );

  return parts.length > 0 ? ` [${parts.join(", ")}]` : "";
}

/**
 * Format index definition.
 */
export function formatIndexDefinition(
  name: string,
  columns: string[],
  options: { unique?: boolean; pk?: boolean } = {},
): string {
  const parts: string[] = [];

  if (options.pk) {
    parts.push("pk");
  } else if (options.unique) {
    parts.push("unique");
  }

  if (columns.length === 1) {
    return parts.length > 0 ? `${columns[0]} [${parts.join(", ")}]` : columns[0];
  }

  const cols = `(${columns.join(", ")})`;
  return parts.length > 0 ? `${cols} [${parts.join(", ")}]` : cols;
}
