import { createHash } from "node:crypto";

/** PostgreSQL identifier length limit (NAMEDATALEN - 1 = 63 by default). */
export const PG_MAX_IDENTIFIER_LENGTH = 63;

/**
 * PostgreSQL reserved keywords that cannot be used as unquoted identifiers.
 * Source: https://www.postgresql.org/docs/current/sql-keywords-appendix.html
 * (reserved + reserved-non-standard).
 */
export const PG_RESERVED_WORDS = new Set<string>([
  "all",
  "analyse",
  "analyze",
  "and",
  "any",
  "array",
  "as",
  "asc",
  "asymmetric",
  "both",
  "case",
  "cast",
  "check",
  "collate",
  "column",
  "constraint",
  "create",
  "current_catalog",
  "current_date",
  "current_role",
  "current_time",
  "current_timestamp",
  "current_user",
  "default",
  "deferrable",
  "desc",
  "distinct",
  "do",
  "else",
  "end",
  "except",
  "false",
  "fetch",
  "for",
  "foreign",
  "from",
  "grant",
  "group",
  "having",
  "in",
  "initially",
  "intersect",
  "into",
  "lateral",
  "leading",
  "limit",
  "localtime",
  "localtimestamp",
  "not",
  "null",
  "offset",
  "on",
  "only",
  "or",
  "order",
  "placing",
  "primary",
  "references",
  "returning",
  "select",
  "session_user",
  "some",
  "symmetric",
  "system_user",
  "table",
  "then",
  "to",
  "trailing",
  "true",
  "union",
  "unique",
  "user",
  "using",
  "variadic",
  "when",
  "where",
  "window",
  "with",
]);

/**
 * Truncate an identifier to fit within PostgreSQL's 63-char limit.
 * Long names get an 8-char hex hash suffix so different inputs that share
 * a prefix do not collapse to the same truncated identifier.
 *
 * Returns the original name if it already fits.
 */
export function truncatePgIdentifier(
  name: string,
  maxLength: number = PG_MAX_IDENTIFIER_LENGTH,
): string {
  if (name.length <= maxLength) return name;
  const hash = createHash("sha1").update(name).digest("hex").slice(0, 8);
  const prefixLength = maxLength - hash.length - 1;
  if (prefixLength <= 0) return hash.slice(0, maxLength);
  return `${name.slice(0, prefixLength)}_${hash}`;
}

/** True when `name` collides with a PostgreSQL reserved word (case-insensitive). */
export function isPgReservedWord(name: string): boolean {
  return PG_RESERVED_WORDS.has(name.toLowerCase());
}
