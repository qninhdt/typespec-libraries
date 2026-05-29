import type { ProtoScalar } from "./scalars.js";

/**
 * ORM semantic scalars whose proto representation is `string`. These scalars
 * are validators-on-string in TypeSpec (`email`, `url`, etc.); on the wire
 * they are just `string`.
 *
 * Storage-only Postgres types (`tsvector`, `citext`, `inet`, `cidr`, `ipv4`,
 * `ipv6`, `mac`, `interval`) are intentionally NOT in this table — see
 * `STORAGE_ONLY_ORM_SCALARS` below. Authors who want to surface them on the
 * wire MUST opt in via `@map` / `@goType`. (Red Team SK3.)
 */
export const ORM_SCALAR_TO_PROTO: ReadonlyMap<string, ProtoScalar> = new Map<string, ProtoScalar>([
  // ORM canonical
  ["uuid", "string"],
  ["jsonb", "string"],

  // Semantic string scalars
  ["email", "string"],
  ["url", "string"],
  ["base64", "string"],
  ["hostname", "string"],

  // ID / token scalars
  ["cuid", "string"],
  ["cuid2", "string"],
  ["ulid", "string"],
  ["nanoid", "string"],
  ["jwt", "string"],
  ["emoji", "string"],

  // Auto-incrementing ints
  ["serial", "int32"],
  ["bigserial", "int64"],

  // Geographic numeric scalars
  ["latitude", "double"],
  ["longitude", "double"],
]);

/**
 * ORM scalars whose proto representation is intentionally NOT in the default
 * mapping. The resolver returns a diagnostic when it encounters one of these
 * without an explicit `@map` / `@goType` override.
 *
 * Rationale (Red Team SK3): these are storage-only Postgres internals that
 * should not silently smear onto the wire. Forcing the author to declare
 * intent surfaces the design decision in PR review.
 */
export const STORAGE_ONLY_ORM_SCALARS: ReadonlySet<string> = new Set([
  "tsvector",
  "tsquery",
  "citext",
  "inet",
  "cidr",
  "ipv4",
  "ipv6",
  "ip",
  "mac",
  "interval",
]);
