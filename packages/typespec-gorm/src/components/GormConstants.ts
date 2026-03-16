/**
 * Constants and type maps used by GORM code generation components.
 * Pure data -no JSX needed.
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
  kind: "index" | "uniqueIndex" | "primaryIndex";
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
      // Convert camelCase to snake_case for the key (e.g., "ownerId" -> "owner_id")
      const camelCol = ct.columns[i];
      const snakeCol = camelCol.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
      const tags = map.get(snakeCol) ?? [];
      tags.push({ kind, name: ct.name, priority: i + 1 });
      map.set(snakeCol, tags);
    }
  }

  return map;
}
