/**
 * Constants and type maps used by GORM code generation components.
 * Pure data — no JSX needed.
 */

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
  kind: "index" | "uniqueIndex";
  name: string;
  priority: number;
}

/**
 * Escape characters that are unsafe inside a Go struct tag value.
 */
export function escapeFormTagValue(value: string): string {
  return value.replace(/`/g, "'").replace(/,/g, " ");
}

/**
 * Build a lookup from column name → composite index/unique tags for that field.
 */
export function buildCompositeMap(
  indexes: { name: string; columns: string[] }[],
  uniques: { name: string; columns: string[] }[],
): Map<string, CompositeFieldTag[]> {
  const map = new Map<string, CompositeFieldTag[]>();

  const addEntries = (
    constraints: { name: string; columns: string[] }[],
    kind: CompositeFieldTag["kind"],
  ) => {
    for (const c of constraints) {
      for (let i = 0; i < c.columns.length; i++) {
        const col = c.columns[i];
        const tags = map.get(col) ?? [];
        tags.push({ kind, name: c.name, priority: i + 1 });
        map.set(col, tags);
      }
    }
  };

  addEntries(indexes, "index");
  addEntries(uniques, "uniqueIndex");
  return map;
}
