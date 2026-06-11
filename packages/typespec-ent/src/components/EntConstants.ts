/**
 * Maps canonical DB type names → Go types and required imports.
 *
 * The Ent column type used to live alongside `goType` here, but it was never
 * emitted: Ent infers column SQL types from the `field.X(...)` builder
 * (see `ent-field.ts`), and length/precision overrides go through
 * `SchemaType(...)` chains. Keeping a parallel `entType` table caused drift
 * risk with no consumer, so it was removed.
 */
export const GO_TYPE_MAP: Record<string, { goType: string; imports?: string[] }> = {
  uuid: { goType: "uuid.UUID", imports: ["github.com/google/uuid"] },
  string: { goType: "string" },
  text: { goType: "string" },
  boolean: { goType: "bool" },
  int8: { goType: "int8" },
  int16: { goType: "int16" },
  int32: { goType: "int32" },
  int64: { goType: "int64" },
  uint8: { goType: "uint8" },
  uint16: { goType: "uint16" },
  uint32: { goType: "uint32" },
  uint64: { goType: "uint64" },
  float32: { goType: "float32" },
  float64: { goType: "float64" },
  decimal: { goType: "decimal.Decimal", imports: ["github.com/shopspring/decimal"] },
  serial: { goType: "int32" },
  bigserial: { goType: "int64" },
  utcDateTime: { goType: "time.Time", imports: ["time"] },
  date: { goType: "time.Time", imports: ["time"] },
  time: { goType: "time.Time", imports: ["time"] },
  duration: { goType: "time.Duration", imports: ["time"] },
  bytes: { goType: "[]byte" },
  jsonb: { goType: "json.RawMessage", imports: ["encoding/json"] },
};

/** Maps custom scalar names with native validator support to validator tags. */
export const GO_NATIVE_VALIDATORS: Record<string, string> = {
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
  ulid: "ulid",
  jwt: "jwt",
};

// Re-export from split modules for backwards compatibility
export {
  escapeFormTagValue,
  escapeComment,
  goStringLiteral,
  buildDocComment,
} from "./ent-string-utils.js";

export { buildImportBlock, type GoPackageImport } from "./ent-imports.js";

export { buildCompositeMap, type CompositeFieldTag } from "./ent-composite.js";

export { buildGoEnumBlock } from "./ent-enum.js";
