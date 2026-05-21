/** Maps canonical DB type names → Go types, Ent column types, and required imports */
export const GO_TYPE_MAP: Record<string, { goType: string; entType: string; imports?: string[] }> =
  {
    uuid: {
      goType: "uuid.UUID",
      entType: "uuid",
      imports: ["github.com/google/uuid"],
    },
    string: { goType: "string", entType: "varchar(255)" },
    text: { goType: "string", entType: "text" },
    boolean: { goType: "bool", entType: "boolean" },
    int8: { goType: "int8", entType: "smallint" },
    int16: { goType: "int16", entType: "smallint" },
    int32: { goType: "int32", entType: "integer" },
    int64: { goType: "int64", entType: "bigint" },
    uint8: { goType: "uint8", entType: "smallint" },
    uint16: { goType: "uint16", entType: "integer" },
    uint32: { goType: "uint32", entType: "bigint" },
    uint64: { goType: "uint64", entType: "bigint" },
    float32: { goType: "float32", entType: "real" },
    float64: { goType: "float64", entType: "double precision" },
    decimal: {
      goType: "decimal.Decimal",
      entType: "numeric",
      imports: ["github.com/shopspring/decimal"],
    },
    serial: { goType: "int32", entType: "serial" },
    bigserial: { goType: "int64", entType: "bigserial" },
    utcDateTime: {
      goType: "time.Time",
      entType: "timestamptz",
      imports: ["time"],
    },
    date: { goType: "time.Time", entType: "date", imports: ["time"] },
    time: { goType: "time.Time", entType: "time", imports: ["time"] },
    duration: {
      goType: "time.Duration",
      entType: "interval",
      imports: ["time"],
    },
    bytes: { goType: "[]byte", entType: "bytea" },
    jsonb: {
      goType: "json.RawMessage",
      entType: "jsonb",
      imports: ["encoding/json"],
    },
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
