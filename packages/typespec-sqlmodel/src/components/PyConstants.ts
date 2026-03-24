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
    const aliasedImport = parseAliasedImport(imp);
    if (aliasedImport) {
      addGroupedImport(
        groups,
        aliasedImport.moduleName,
        `${aliasedImport.name} as ${aliasedImport.alias}`,
      );
      continue;
    }

    const lastDot = imp.lastIndexOf(".");
    if (lastDot === -1) {
      if (imp === "TYPE_CHECKING") {
        addGroupedImport(groups, "typing", imp);
      } else {
        groups.set(imp, new Set([imp]));
      }
      continue;
    }

    const mod = imp.substring(0, lastDot);
    const name = imp.substring(lastDot + 1);
    addGroupedImport(groups, mod, name);
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

export interface PyInitModelExport {
  name: string;
  moduleFile: string;
}

export interface PyInitOptions {
  moduleName: string;
  models?: PyInitModelExport[];
  childPackages?: string[];
  includeMetadata?: boolean;
  importAssociations?: boolean;
}

/**
 * Generate __init__.py for a generated package.
 */
export function generateInit(options: PyInitOptions): string {
  const imports: string[] = [];
  const allExports: string[] = [];

  if (options.includeMetadata) {
    imports.push("from sqlmodel import SQLModel");
  }

  if (options.importAssociations) {
    imports.push("from . import __associations__");
  }

  for (const childPackage of options.childPackages ?? []) {
    imports.push(`from . import ${childPackage}`);
    allExports.push(`${FOUR_SPACES}"${childPackage}",`);
  }

  for (const model of options.models ?? []) {
    imports.push(`from .${model.moduleFile} import ${model.name}`);
    allExports.push(`${FOUR_SPACES}"${model.name}",`);
  }

  let code = `"""${options.moduleName} - auto-generated models. DO NOT EDIT."""\n\n`;

  if (imports.length > 0) {
    code += imports.join("\n");
    code += "\n\n";
  }

  if (options.includeMetadata) {
    code += "metadata = SQLModel.metadata\n\n";
    allExports.push(`${FOUR_SPACES}"metadata",`);
  }

  code += "__all__ = [\n";
  code += allExports.join("\n");
  code += "\n]\n";

  return code;
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
    code += `from ${mod} import ${[...names].sort((left, right) => left.localeCompare(right)).join(", ")}\n`;
  }
  if (stdGroups.size > 0) code += "\n";

  const saGroups = groupImports(saImports);
  for (const [mod, names] of saGroups) {
    code += `from ${mod} import ${[...names].sort((left, right) => left.localeCompare(right)).join(", ")}\n`;
  }

  const importList = [...sqlmodelOrPydanticImports].sort((left, right) =>
    left.localeCompare(right),
  );
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
  if (["url", "uri"].includes(format)) return "AnyUrl";
  return undefined;
}

function parseAliasedImport(
  value: string,
): { moduleName: string; name: string; alias: string } | undefined {
  const pattern = /^(.+)\.(\w+)\s+as\s+(\w+)$/;
  const match = pattern.exec(value);
  if (!match) {
    return undefined;
  }

  const [, moduleName, name, alias] = match;
  return { moduleName, name, alias };
}

function addGroupedImport(
  groups: Map<string, Set<string>>,
  moduleName: string,
  name: string,
): void {
  if (!groups.has(moduleName)) {
    groups.set(moduleName, new Set());
  }
  groups.get(moduleName)!.add(name);
}
