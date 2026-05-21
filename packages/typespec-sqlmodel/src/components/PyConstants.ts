import { generatedHeader } from "@qninhdt/typespec-orm";

export const FILE_HEADER = `# ${generatedHeader}
# Source: https://github.com/qninhdt/typespec-libraries

`;

export const NEEDS_SA_COLUMN = new Set([
  "text",
  "jsonb",
  "utcDateTime",
  "date",
  "time",
  "bytes",
  "decimal",
]);

export interface PythonTypeMapping {
  pyType: string;
  saColumnType?: string;
  imports: readonly string[];
  saImports: readonly string[];
}

export const UNKNOWN_PY_TYPE: PythonTypeMapping = {
  pyType: "Any",
  imports: ["typing.Any"],
  saImports: [],
};

export const PYTHON_TYPE_MAP: Record<string, PythonTypeMapping> = {
  uuid: { pyType: "UUID", imports: ["uuid.UUID"], saImports: [] },
  string: { pyType: "str", saColumnType: "String", imports: [], saImports: ["sqlalchemy.String"] },
  text: { pyType: "str", saColumnType: "Text", imports: [], saImports: ["sqlalchemy.Text"] },
  boolean: {
    pyType: "bool",
    saColumnType: "Boolean",
    imports: [],
    saImports: ["sqlalchemy.Boolean"],
  },
  int8: {
    pyType: "int",
    saColumnType: "SmallInteger",
    imports: [],
    saImports: ["sqlalchemy.SmallInteger"],
  },
  int16: {
    pyType: "int",
    saColumnType: "SmallInteger",
    imports: [],
    saImports: ["sqlalchemy.SmallInteger"],
  },
  int32: { pyType: "int", saColumnType: "Integer", imports: [], saImports: ["sqlalchemy.Integer"] },
  serial: {
    pyType: "int",
    saColumnType: "Integer",
    imports: [],
    saImports: ["sqlalchemy.Integer"],
  },
  int64: {
    pyType: "int",
    saColumnType: "BigInteger",
    imports: [],
    saImports: ["sqlalchemy.BigInteger"],
  },
  bigserial: {
    pyType: "int",
    saColumnType: "BigInteger",
    imports: [],
    saImports: ["sqlalchemy.BigInteger"],
  },
  uint8: { pyType: "int", saColumnType: "Integer", imports: [], saImports: ["sqlalchemy.Integer"] },
  uint16: {
    pyType: "int",
    saColumnType: "Integer",
    imports: [],
    saImports: ["sqlalchemy.Integer"],
  },
  uint32: {
    pyType: "int",
    saColumnType: "BigInteger",
    imports: [],
    saImports: ["sqlalchemy.BigInteger"],
  },
  uint64: {
    pyType: "int",
    saColumnType: "BigInteger",
    imports: [],
    saImports: ["sqlalchemy.BigInteger"],
  },
  float32: { pyType: "float", saColumnType: "Float", imports: [], saImports: ["sqlalchemy.Float"] },
  float64: {
    pyType: "float",
    saColumnType: "Double",
    imports: [],
    saImports: ["sqlalchemy.Double"],
  },
  decimal: {
    pyType: "Decimal",
    saColumnType: "Numeric",
    imports: ["decimal.Decimal"],
    saImports: ["sqlalchemy.Numeric"],
  },
  utcDateTime: {
    pyType: "datetime",
    saColumnType: "DateTime(timezone=True)",
    imports: ["datetime.datetime"],
    saImports: ["sqlalchemy.DateTime"],
  },
  date: {
    pyType: "date",
    saColumnType: "Date",
    imports: ["datetime.date"],
    saImports: ["sqlalchemy.Date"],
  },
  time: {
    pyType: "time",
    saColumnType: "Time",
    imports: ["datetime.time"],
    saImports: ["sqlalchemy.Time"],
  },
  duration: {
    pyType: "timedelta",
    saColumnType: "Interval",
    imports: ["datetime.timedelta"],
    saImports: ["sqlalchemy.Interval"],
  },
  bytes: {
    pyType: "bytes",
    saColumnType: "LargeBinary",
    imports: [],
    saImports: ["sqlalchemy.LargeBinary"],
  },
  jsonb: {
    pyType: "dict[str, Any]",
    saColumnType: "JSONB",
    imports: ["typing.Any"],
    saImports: ["sqlalchemy.dialects.postgresql.JSONB"],
  },
};

export function getPythonTypeMap(dbType: string): PythonTypeMapping {
  return PYTHON_TYPE_MAP[dbType] ?? UNKNOWN_PY_TYPE;
}

// Re-export from split modules for backwards compatibility
export {
  FOUR_SPACES,
  pythonStringLiteral,
  pythonTripleQuotedString,
  serializeColumnKwargs,
  promoteFieldArgsToColumn,
  getNativePydanticType,
} from "./py-field-utils.js";

export { groupImports, buildPythonImportBlock, toPythonRelativeImport } from "./py-imports.js";

export { generateEnumClass } from "./py-enum.js";

export { generateInit, type PyInitOptions, type PyInitModelExport } from "./py-init.js";
