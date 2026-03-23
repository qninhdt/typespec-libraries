/**
 * Constants, type maps, and utility functions for SQLModel components.
 */
import type { EnumMemberInfo } from "@qninhdt/typespec-orm";
import { generatedHeader, camelToSnake } from "@qninhdt/typespec-orm";

export const FILE_HEADER = `# ${generatedHeader}
# Source: https://github.com/qninhdt/typespec-libraries

`;

export const FOUR_SPACES = "    ";

/** DB types that always need an explicit SA column type in `sa_column=Column(Type, ...)` */
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

/**
 * Convert an array of column-level arguments into a Python dict literal for `sa_column_kwargs={...}`.
 */
export function serializeColumnKwargs(columnArgs: string[]): string {
  const pairs = columnArgs.map((a) => {
    const eqIdx = a.indexOf("=");
    if (eqIdx === -1) return `"${a}": True`;
    const key = a.substring(0, eqIdx);
    const val = a.substring(eqIdx + 1);
    return `"${key}": ${val}`;
  });
  return `{${pairs.join(", ")}}`;
}

/**
 * Move Field-level `index=True`, `unique=True`, and `foreign_key="ref"` into Column-level args
 * when generating `sa_column=Column(...)`.
 */
export function promoteFieldArgsToColumn(
  fieldArgs: string[],
  columnArgs: string[],
  saImports: Set<string>,
): string[] {
  const filtered: string[] = [];
  for (const a of fieldArgs) {
    if (a === "index=True") {
      columnArgs.push("index=True");
    } else if (a === "unique=True") {
      columnArgs.push("unique=True");
    } else if (a.startsWith("foreign_key=")) {
      const match = a.match(/^foreign_key="(.+)"$/);
      if (match) {
        saImports.add("sqlalchemy.ForeignKey");
        columnArgs.unshift(`ForeignKey("${match[1]}")`);
      }
    } else if (a.startsWith("nullable=") || a.startsWith("server_default=")) {
      continue;
    } else {
      filtered.push(a);
    }
  }
  return filtered;
}

/**
 * Group "module.Name" imports into { module → Set<Name> }.
 */
export function groupImports(imports: Set<string>): Map<string, Set<string>> {
  const groups = new Map<string, Set<string>>();

  for (const imp of imports) {
    const asMatch = imp.match(/^(.+)\.(\w+)\s+as\s+(\w+)$/);
    if (asMatch) {
      const [, mod, name, alias] = asMatch;
      if (!groups.has(mod)) groups.set(mod, new Set());
      groups.get(mod)!.add(`${name} as ${alias}`);
      continue;
    }

    const lastDot = imp.lastIndexOf(".");
    if (lastDot === -1) {
      // No dot - single import like "TYPE_CHECKING" or "Enum"
      // For TYPE_CHECKING, we need to add it to typing module
      if (imp === "TYPE_CHECKING") {
        if (!groups.has("typing")) groups.set("typing", new Set());
        groups.get("typing")!.add(imp);
      } else {
        groups.set(imp, new Set([imp]));
      }
      continue;
    }

    const mod = imp.substring(0, lastDot);
    const name = imp.substring(lastDot + 1);
    if (!groups.has(mod)) groups.set(mod, new Set());
    groups.get(mod)!.add(name);
  }

  return groups;
}

/**
 * Generate a Python `str, enum.Enum` class.
 */
export function generateEnumClass(enumName: string, members: EnumMemberInfo[]): string {
  let code = `class ${enumName}(str, Enum):\n`;
  code += `${FOUR_SPACES}"""Auto-generated enum for ${camelToSnake(enumName)}."""\n\n`;
  for (const m of members) {
    code += `${FOUR_SPACES}${camelToSnake(m.name)} = "${m.value}"\n`;
  }
  return code;
}

/**
 * Generate __init__.py that re-exports all models.
 */
export function generateInit(
  modelNames: string[],
  moduleFiles: string[],
  moduleName: string,
): string {
  const imports = modelNames.map((name, i) => `from .${moduleFiles[i]} import ${name}`);
  const allExports = modelNames.map((name) => `${FOUR_SPACES}"${name}",`);

  return (
    `"""${moduleName} - auto-generated models. DO NOT EDIT."""\n\n` +
    imports.join("\n") +
    "\n\n__all__ = [\n" +
    allExports.join("\n") +
    "\n]\n"
  );
}

/**
 * Generate import block for Python file.
 */
export function buildPythonImportBlock(
  stdImports: Set<string>,
  saImports: Set<string>,
  sqlmodelOrPydanticImports: Set<string>,
  importSource: "sqlmodel" | "pydantic",
): string {
  let code = "";

  const stdGroups = groupImports(stdImports);
  for (const [mod, names] of stdGroups) {
    code += `from ${mod} import ${[...names].sort().join(", ")}\n`;
  }
  if (stdGroups.size > 0) code += "\n";

  const saGroups = groupImports(saImports);
  for (const [mod, names] of saGroups) {
    code += `from ${mod} import ${[...names].sort().join(", ")}\n`;
  }

  const importList = [...sqlmodelOrPydanticImports].sort();
  code += `from ${importSource} import ${importList.join(", ")}\n`;

  return code;
}

/**
 * Resolve a @format value to its Pydantic type override.
 * Returns the Pydantic type name (e.g. "EmailStr", "AnyUrl") or undefined if unknown.
 * Used by both SQLModel field generation and Pydantic data model generation.
 */
export function resolveFormatPyType(format: string): string | undefined {
  if (format === "email") return "EmailStr";
  if (format === "url" || format === "uri") return "AnyUrl";
  return undefined;
}
