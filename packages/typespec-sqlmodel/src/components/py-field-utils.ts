import {
  getMaxLength,
  getMinLength,
  getMinValue,
  getMaxValue,
  getPattern,
  type Model,
  type ModelProperty,
  type Program,
  type Scalar,
  walkPropertiesInherited,
} from "@typespec/compiler";
import { getOrmScalarName, isCustomScalar, resolveDbType } from "@qninhdt/typespec-orm";
import { getPythonTypeMap } from "./PyConstants.js";

export const FOUR_SPACES = "    ";

export function pythonStringLiteral(value: string): string {
  return JSON.stringify(value);
}

const SQL_CALL_EXPRESSION = /^[A-Za-z_]\w*\s*\(.*\)$/;

export function renderServerDefault(
  _program: Program,
  prop: ModelProperty,
  value: string,
  saImports: Set<string>,
): string {
  const propType = prop.type;
  const scalarName =
    propType.kind === "Scalar" ? (getOrmScalarName(propType) ?? propType.name) : undefined;

  if (scalarName === "boolean" && (value === "true" || value === "false")) {
    saImports.add("sqlalchemy.text");
    return `text(${pythonStringLiteral(value)})`;
  }

  if (typeof value === "string" && SQL_CALL_EXPRESSION.test(value.trim())) {
    saImports.add("sqlalchemy.text");
    return `text(${pythonStringLiteral(value)})`;
  }

  return pythonStringLiteral(value);
}

export function pythonTripleQuotedString(value: string): string {
  return `"""${value.replaceAll("\\", "\\\\").replaceAll('"""', '\\"\\"\\"')}"""`;
}

const PYTHON_KEYWORDS = new Set([
  "False", "None", "True", "and", "as", "assert", "async", "await",
  "break", "class", "continue", "def", "del", "elif", "else", "except",
  "finally", "for", "from", "global", "if", "import", "in", "is",
  "lambda", "nonlocal", "not", "or", "pass", "raise", "return", "try",
  "while", "with", "yield", "match", "case",
]);

export function toPythonIdentifier(name: string): string {
  const normalized = name.replaceAll(/[^\w]/g, "_");
  const prefixed = /^\d/.test(normalized) ? `_${normalized}` : normalized;
  return PYTHON_KEYWORDS.has(prefixed) ? `${prefixed}_` : prefixed;
}

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
      const match = /^foreign_key="(.+)"$/.exec(a);
      if (match) {
        saImports.add("sqlalchemy.ForeignKey");
        columnArgs.unshift(`ForeignKey("${match[1]}")`);
      }
    } else if (a.startsWith("nullable=")) {
      columnArgs.push(a);
    } else if (a.startsWith("server_default=")) {
      continue;
    } else {
      filtered.push(a);
    }
  }
  return filtered;
}

export function getNativePydanticType(scalarName: string): string | undefined {
  switch (scalarName) {
    case "email":
      return "EmailStr";
    case "url":
      return "AnyUrl";
    case "ipv4":
      return "IPv4Address";
    case "ipv6":
      return "IPv6Address";
    case "ip":
      return "IPvAnyAddress";
    default:
      return undefined;
  }
}

export function generateScalarAlias(
  program: Program,
  scalar: Scalar,
  stdImports: Set<string>,
  pydanticImports: Set<string>,
  aliasName = scalar.name,
): string {
  const baseDbType = resolveDbType(scalar);
  const mapping = baseDbType ? getPythonTypeMap(baseDbType) : getPythonTypeMap("unknown");

  for (const imp of mapping.imports) {
    stdImports.add(imp);
  }
  stdImports.add("typing.Annotated");
  pydanticImports.add("Field");

  const fieldArgs: string[] = [];
  const maxLen = getMaxLength(program, scalar);
  const minLen = getMinLength(program, scalar);
  const minVal = getMinValue(program, scalar);
  const maxVal = getMaxValue(program, scalar);
  const pattern = getPattern(program, scalar);

  if (maxLen !== undefined) fieldArgs.push(`max_length=${maxLen}`);
  if (minLen !== undefined) fieldArgs.push(`min_length=${minLen}`);
  if (minVal !== undefined) fieldArgs.push(`ge=${minVal}`);
  if (maxVal !== undefined) fieldArgs.push(`le=${maxVal}`);
  if (pattern !== undefined) fieldArgs.push(`pattern=${pythonStringLiteral(pattern)}`);

  return `${aliasName} = Annotated[${mapping.pyType}, Field(${fieldArgs.join(", ")})]`;
}

/**
 * Collect custom scalars referenced by a model that do not have a native
 * Pydantic type and therefore need generated aliases.
 */
export function collectAliasableCustomScalars(program: Program, model: Model): Set<Scalar> {
  const scalars = new Set<Scalar>();
  for (const prop of walkPropertiesInherited(model)) {
    let current = prop.type;
    if (current.kind === "ModelProperty") current = current.type;
    if (current.kind !== "Scalar") continue;
    if (isAliasableCustomScalar(program, current)) {
      scalars.add(current);
    }
  }
  return scalars;
}

export function isAliasableCustomScalar(program: Program, scalar: Scalar): boolean {
  const semanticScalarName = getOrmScalarName(scalar);
  const nativeType = getNativePydanticType(semanticScalarName ?? scalar.name);
  if (!isCustomScalar(program, scalar) || nativeType) {
    return false;
  }

  const dbType = resolveDbType(scalar);
  if (!dbType) {
    return false;
  }

  return getPythonTypeMap(dbType).pyType !== "Any";
}
