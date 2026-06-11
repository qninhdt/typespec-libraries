/**
 * DBML type mappings and constants.
 */

import type { Model, ModelProperty, Program, Type } from "@typespec/compiler";
import { getSchemaName, getTableName, resolveDbType } from "@qninhdt/typespec-orm";
import { reportDiagnostic } from "../lib.js";

/**
 * DBML reserved tokens that MUST be quoted whenever used as identifiers,
 * regardless of shape. Comparison is case-insensitive because DBML keywords
 * are recognized case-insensitively by the parser.
 */
export const DBML_RESERVED_WORDS: ReadonlySet<string> = new Set([
  "table",
  "ref",
  "note",
  "enum",
  "project",
  "indexes",
  "pk",
  "tablegroup",
]);

/**
 * SQL reserved words that must be quoted when used as identifiers so the
 * downstream `dbml2sql --postgres` output is syntactically valid SQL. DBML's
 * parser does not require these to be quoted, but Postgres does — and DBML is
 * the source of truth for our SQL emission.
 */
export const POSTGRES_RESERVED_WORDS: ReadonlySet<string> = new Set([
  "user",
  "order",
  "select",
  "from",
  "where",
  "group",
  "table",
  "column",
  "index",
  "unique",
  "primary",
  "foreign",
  "references",
  "check",
  "default",
  "constraint",
  "key",
  "on",
  "to",
  "as",
  "case",
  "when",
  "then",
  "else",
  "end",
  "null",
  "true",
  "false",
  "and",
  "or",
  "not",
  "in",
  "is",
  "between",
  "like",
  "having",
  "distinct",
  "by",
  "asc",
  "desc",
  "limit",
  "offset",
  "join",
  "inner",
  "outer",
  "left",
  "right",
  "cross",
  "using",
]);

/**
 * Quote a DBML identifier when it is not a bare ASCII identifier or when it
 * collides with a DBML or Postgres reserved token. Use this for every emitted
 * identifier (schema, table, column) so refs and table headings stay parseable
 * AND so `dbml2sql --postgres` produces valid SQL.
 */
export function quoteDbmlIdentifier(name: string): string {
  const lowered = name.toLowerCase();
  if (DBML_RESERVED_WORDS.has(lowered) || POSTGRES_RESERVED_WORDS.has(lowered)) {
    return `"${name.replaceAll('"', '\\"')}"`;
  }
  return /^[A-Za-z_][\w]*$/.test(name) ? name : `"${name.replaceAll('"', '\\"')}"`;
}

/**
 * Build a DBML-qualified table reference (`schema.table` when @schema is set,
 * just `table` otherwise). Shared by association and relation-field emitters
 * so split-by-namespace docs render cross-schema FKs consistently. Each
 * component is quoted independently when needed.
 */
export function qualifyDbmlTable(program: Program, model: Model): string {
  const schema = getSchemaName(program, model);
  const table = getTableName(program, model);
  const quotedTable = quoteDbmlIdentifier(table);
  return schema ? `${quoteDbmlIdentifier(schema)}.${quotedTable}` : quotedTable;
}

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
  // Common PostgreSQL scalars that previously fell through to `unsupported-type`.
  // dbdocs / dbml2sql treat unknown types as opaque strings, so passing the
  // PG-canonical name preserves intent for niche but common production types.
  citext: "citext",
  inet: "inet",
  cidr: "cidr",
  macaddr: "macaddr",
  tsvector: "tsvector",
  xml: "xml",
  money: "money",
};

/**
 * Get DBML type for a TypeSpec type.
 *
 * `propContext`, when supplied, is the property the resolution started from.
 * It is used as the diagnostic target when an array element type cannot be
 * mapped, so the warning points at the user-visible property rather than at
 * an anonymous indexer node.
 */
export function getDbmlType(
  program: Program,
  type: Type,
  propContext?: ModelProperty,
): string | undefined {
  if (type.kind === "ModelProperty") {
    return getDbmlType(program, type.type, type);
  }

  if (type.kind === "Model" && type.indexer) {
    const inner = type.indexer.value;
    // Enum arrays: dbdocs accepts `EnumName[]`. Without this branch enum-typed
    // arrays returned undefined and tripped `unsupported-type` despite scalar
    // arrays already round-tripping fine.
    if (inner.kind === "Enum") {
      return `${inner.name}[]`;
    }
    const itemType = getDbmlType(program, inner, propContext);
    if (itemType) {
      return `${itemType}[]`;
    }
    // Element type unmapped — DBML is documentation, so a `jsonb` fallback is
    // acceptable, but it must be loud. Surface a warning so users know the
    // emitted type does not faithfully represent the source schema.
    if (propContext) {
      reportDiagnostic(program, {
        code: "unsupported-array-element",
        target: propContext,
        format: { propName: propContext.name },
      });
    }
    return "jsonb";
  }

  // Handle scalar types
  if (type.kind === "Scalar") {
    // Look up by the scalar's own name first so semantic PG scalars declared
    // as `scalar citext extends string` render as `citext` rather than
    // collapsing to the base `text`. The same path covers ORM semantic
    // scalars (cidr, inet, ...) that are now first-class in DBML_TYPE_MAP.
    const scalarName = type.name;
    if (scalarName && DBML_TYPE_MAP[scalarName]) {
      return DBML_TYPE_MAP[scalarName];
    }

    const dbType = resolveDbType(type);
    if (dbType) {
      return DBML_TYPE_MAP[dbType];
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
