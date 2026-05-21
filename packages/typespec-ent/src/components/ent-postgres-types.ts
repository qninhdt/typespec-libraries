export function resolvePostgresArrayElementType(dbType: string): string | undefined {
  switch (dbType) {
    case "string":
    case "text":
      return "text";
    case "uuid":
      return "uuid";
    case "boolean":
      return "boolean";
    case "int8":
    case "int16":
    case "int32":
    case "serial":
      return "integer";
    case "int64":
    case "bigserial":
      return "bigint";
    case "uint8":
    case "uint16":
    case "uint32":
    case "uint64":
      return "bigint";
    case "float32":
      return "real";
    case "float64":
      return "double precision";
    case "decimal":
      return "numeric";
    case "date":
      return "date";
    case "time":
      return "time";
    case "utcDateTime":
      return "timestamptz";
    default:
      return undefined;
  }
}
