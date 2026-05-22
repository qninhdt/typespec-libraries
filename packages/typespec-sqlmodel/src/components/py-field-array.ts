/**
 * PyField — array-typed property generator.
 *
 * Handles list[T] columns with JSONB or postgres ARRAY storage strategies.
 */

import type { ModelProperty, Program } from "@typespec/compiler";
import {
  getDefaultValue,
  getDoc,
  getMaxItems,
  getMinItems,
  getArrayElementType,
  isArrayType,
  isKey,
  resolveDbType,
} from "@qninhdt/typespec-orm";
import { reportDiagnostic, type SqlModelEmitterOptions } from "../lib.js";
import {
  FOUR_SPACES,
  getPythonTypeMap,
  pythonStringLiteral,
  serializeColumnKwargs,
} from "./PyConstants.js";
import { renderServerDefault } from "./py-field-utils.js";

export function generateArrayField(
  program: Program,
  prop: ModelProperty,
  pyFieldName: string,
  stdImports: Set<string>,
  saImports: Set<string>,
  needsField: { value: boolean },
  needsColumn: { value: boolean },
  collectionStrategy?: SqlModelEmitterOptions["collection-strategy"],
): string {
  const elementType = getArrayElementType(prop.type);
  const elementDbType = elementType ? resolveDbType(elementType) : undefined;
  const elementPyType = elementDbType ? getPythonTypeMap(elementDbType).pyType : "Any";

  for (const imp of getPythonTypeMap(elementDbType ?? "unknown").imports) {
    stdImports.add(imp);
  }

  let pyType = `list[${elementPyType}]`;
  const isOptional = prop.optional;
  if (isOptional) {
    pyType = `${pyType} | None`;
  }

  const isPk = isKey(program, prop);
  const doc = getDoc(program, prop);
  const docComment = doc ? `${FOUR_SPACES}# ${doc}\n` : "";

  const fieldArgs: string[] = [];
  const columnArgs: string[] = [];
  let arrayColumnType: string | undefined;

  if (!collectionStrategy) {
    reportDiagnostic(program, {
      code: "unsupported-type",
      format: { typeName: "array", propName: prop.name },
      target: prop,
    });
  } else if (collectionStrategy === "jsonb") {
    arrayColumnType = "JSONB";
    saImports.add("sqlalchemy.dialects.postgresql.JSONB");
  } else if (elementType) {
    const postgresArrayType = resolvePostgresArrayType(elementType);
    if (postgresArrayType) {
      arrayColumnType = `ARRAY(${postgresArrayType.expression})`;
      saImports.add("sqlalchemy.ARRAY");
      for (const imp of postgresArrayType.saImports) saImports.add(imp);
    } else {
      reportDiagnostic(program, {
        code: "unsupported-type",
        format: { typeName: elementDbType ?? elementType.kind, propName: prop.name },
        target: prop,
      });
    }
  }

  if (isPk) {
    needsField.value = true;
    fieldArgs.push("primary_key=True");
  }

  if (!isOptional && !isPk) {
    columnArgs.push("nullable=False");
  }
  if (isOptional) {
    needsField.value = true;
    fieldArgs.push("default=None");
  }

  const minItems = getMinItems(program, prop);
  const maxItems = getMaxItems(program, prop);
  if (minItems !== undefined) {
    needsField.value = true;
    fieldArgs.push(`min_length=${minItems}`);
  }
  if (maxItems !== undefined) {
    needsField.value = true;
    fieldArgs.push(`max_length=${maxItems}`);
  }

  const defaultVal = getDefaultValue(program, prop);
  if (defaultVal !== undefined && !isPk) {
    needsColumn.value = true;
    columnArgs.push(
      `server_default=${renderServerDefault(program, prop, defaultVal, saImports)}`,
    );
  }

  if (doc) {
    needsColumn.value = true;
    columnArgs.push(`comment=${pythonStringLiteral(doc)}`);
  }

  if (arrayColumnType) {
    needsField.value = true;
    needsColumn.value = true;
    saImports.add("sqlalchemy.Column");
    const allColumnArgs = [arrayColumnType, ...columnArgs].join(", ");
    fieldArgs.push(`sa_column=Column(${allColumnArgs})`);
    return `${docComment}${FOUR_SPACES}${pyFieldName}: ${pyType} = Field(${fieldArgs.join(", ")})\n`;
  }

  if (fieldArgs.length > 0 || columnArgs.length > 0) {
    needsField.value = true;
    if (columnArgs.length > 0) {
      fieldArgs.push(`sa_column_kwargs=${serializeColumnKwargs(columnArgs)}`);
    }
    return `${docComment}${FOUR_SPACES}${pyFieldName}: ${pyType} = Field(${fieldArgs.join(", ")})\n`;
  }

  return `${docComment}${FOUR_SPACES}${pyFieldName}: ${pyType}\n`;
}

function resolvePostgresArrayType(
  type: ModelProperty["type"],
): { expression: string; saImports: string[] } | undefined {
  if (type.kind === "ModelProperty") {
    return resolvePostgresArrayType(type.type);
  }
  if (type.kind === "Enum") {
    return {
      expression: `SAEnum(${type.name})`,
      saImports: ["sqlalchemy.Enum as SAEnum"],
    };
  }
  if (isArrayType(type)) {
    return undefined;
  }

  const dbType = resolveDbType(type);

  switch (dbType) {
    case "uuid":
      return {
        expression: "PGUUID(as_uuid=True)",
        saImports: ["sqlalchemy.dialects.postgresql.UUID as PGUUID"],
      };
    case "string":
      return { expression: "String", saImports: ["sqlalchemy.String"] };
    case "text":
      return { expression: "Text", saImports: ["sqlalchemy.Text"] };
    case "boolean":
      return { expression: "Boolean", saImports: ["sqlalchemy.Boolean"] };
    case "int8":
    case "int16":
      return { expression: "SmallInteger", saImports: ["sqlalchemy.SmallInteger"] };
    case "int32":
    case "serial":
      return { expression: "Integer", saImports: ["sqlalchemy.Integer"] };
    case "int64":
    case "bigserial":
    case "uint32":
    case "uint64":
      return { expression: "BigInteger", saImports: ["sqlalchemy.BigInteger"] };
    case "uint8":
    case "uint16":
      return { expression: "Integer", saImports: ["sqlalchemy.Integer"] };
    case "float32":
      return { expression: "Float", saImports: ["sqlalchemy.Float"] };
    case "float64":
      return { expression: "Double", saImports: ["sqlalchemy.Double"] };
    case "decimal":
      return { expression: "Numeric", saImports: ["sqlalchemy.Numeric"] };
    case "date":
      return { expression: "Date", saImports: ["sqlalchemy.Date"] };
    case "time":
      return { expression: "Time", saImports: ["sqlalchemy.Time"] };
    case "utcDateTime":
      return { expression: "DateTime(timezone=True)", saImports: ["sqlalchemy.DateTime"] };
    default:
      return undefined;
  }
}
