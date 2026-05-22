/**
 * DBML type mappings and constants.
 */

import type { Program, Type } from "@typespec/compiler";
import { resolveDbType } from "@qninhdt/typespec-orm";

/**
 * Map TypeSpec types to DBML types.
 */
export const DBML_TYPE_MAP: Record<string, string> = {
  uuid: "uuid",
  string: "text",
  text: "text",
  boolean: "boolean",
  int8: "smallint",
  int16: "smallint",
  int32: "integer",
  int64: "bigint",
  uint8: "smallint",
  uint16: "integer",
  uint32: "bigint",
  uint64: "bigint",
  float32: "real",
  float64: "double precision",
  decimal: "numeric",
  serial: "serial",
  bigserial: "bigserial",
  utcDateTime: "timestamptz",
  date: "date",
  time: "time",
  duration: "interval",
  bytes: "bytea",
  jsonb: "jsonb",
};

/**
 * Get DBML type for a TypeSpec type.
 */
export function getDbmlType(program: Program, type: Type): string | undefined {
  if (type.kind === "ModelProperty") {
    return getDbmlType(program, type.type);
  }

  if (type.kind === "Model" && type.indexer) {
    const itemType = getDbmlType(program, type.indexer.value);
    return itemType ? `${itemType}[]` : "jsonb";
  }

  // Handle scalar types
  if (type.kind === "Scalar") {
    const dbType = resolveDbType(type);
    if (dbType) {
      return DBML_TYPE_MAP[dbType];
    }
    // For custom scalars, try using the name
    const scalarName = type.name;
    if (scalarName) {
      return DBML_TYPE_MAP[scalarName];
    }
  }

  return undefined;
}

/**
 * Format a DBML column definition with settings.
 */
export interface ColumnSettings {
  pk?: boolean;
  increment?: boolean;
  notNull?: boolean;
  unique?: boolean;
  default?: string;
  note?: string;
}

export function formatColumnSettings(settings: ColumnSettings): string {
  const parts: string[] = [];

  if (settings.pk) parts.push("pk");
  if (settings.increment) parts.push("increment");
  if (settings.notNull) parts.push("not null");
  if (settings.unique) parts.push("unique");
  if (settings.default !== undefined) {
    const val = settings.default;
    if (
      /^[a-zA-Z_][\w]*\(.*\)$/.test(val) ||
      /^-?\d+(\.\d+)?$/.test(val) ||
      /^(true|false|null)$/i.test(val)
    ) {
      parts.push(`default: \`${val}\``);
    } else {
      parts.push(`default: '${escapeDbmlSetting(val)}'`);
    }
  }
  if (settings.note) {
    parts.push(`note: ${formatDbmlNote(settings.note)}`);
  }

  return parts.length > 0 ? ` [${parts.join(", ")}]` : "";
}

function escapeDbmlSetting(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

/**
 * Format a note value for DBML.
 *
 * DBML supports two forms:
 *   - short single-quoted: `'...'`
 *   - long triple-quoted:  `'''...'''`
 *
 * Triple-quoted form lets us embed quotes, backticks, and newlines without
 * fragile escape sequences. Stripping the characters (the previous behavior)
 * silently lost information from the user's docs, so we now preserve them.
 *
 * Returns the formatted note value INCLUDING surrounding quotes.
 */
export function formatDbmlNote(note: string): string {
  if (!/['"`]|\r?\n/.test(note)) {
    return `'${note}'`;
  }
  // Normalize CRLF/CR to LF for stable output across platforms.
  const normalized = note.replaceAll(/\r\n?/g, "\n");
  // DBML closes long notes on `'''`. Defuse any literal triple-apostrophe run
  // anywhere in the content, plus any trailing apostrophes that would combine
  // with the closing `'''` into 4+ consecutive apostrophes.
  let escaped = normalized.replaceAll(/'{3,}/g, (run) => run.replaceAll("'", "\\'"));
  escaped = escaped.replace(/'+$/, (run) => run.replaceAll("'", "\\'"));
  return `'''${escaped}'''`;
}
