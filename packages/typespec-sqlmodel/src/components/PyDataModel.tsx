/**
 * PyDataModel -JSX component for @data model → Pydantic BaseModel.
 *
 * DTOs/form models -no table, no SQLAlchemy.
 */

import { SourceFile } from "@alloy-js/core";
import type { Children } from "@alloy-js/core/jsx-runtime";
import type { Model, ModelProperty, Program } from "@typespec/compiler";
import type { EnumMemberInfo } from "@qninhdt/typespec-orm";
import {
  getDoc,
  getFormat,
  getMaxLength,
  getMaxValue,
  getMinLength,
  getMinValue,
  getPattern,
  getPlaceholder,
  getPropertyEnum,
  getTitle,
  resolveDbType,
  camelToSnake,
} from "@qninhdt/typespec-orm";
import { reportDiagnostic } from "../lib.js";
import {
  FILE_HEADER,
  FOUR_SPACES,
  getPythonTypeMap,
  generateEnumClass,
  buildPythonImportBlock,
  resolveFormatPyType,
} from "./PyConstants.js";

export interface PyDataFileProps {
  readonly program: Program;
  readonly model: Model;
  readonly label: string;
}

/**
 * JSX component: renders a complete Python source file for a Pydantic BaseModel.
 */
export function PyDataFile(props: PyDataFileProps): Children {
  const { program, model, label } = props;
  const fileName = camelToSnake(model.name) + ".py";

  const stdImports = new Set<string>();
  const pydanticImports = new Set<string>(["BaseModel"]);
  const enumTypes = new Map<string, EnumMemberInfo[]>();
  const fieldDefs: string[] = [];

  for (const [, prop] of model.properties) {
    const enumInfo = getPropertyEnum(prop);
    if (enumInfo && !enumTypes.has(enumInfo.enumType.name)) {
      enumTypes.set(enumInfo.enumType.name, enumInfo.members);
      stdImports.add("enum.Enum");
    }
    fieldDefs.push(generatePydanticField(program, prop, stdImports, pydanticImports));
  }

  let code = FILE_HEADER;
  code += buildPythonImportBlock(stdImports, new Set(), pydanticImports, "pydantic");
  code += "\n\n";

  for (const [enumName, members] of enumTypes) {
    code += generateEnumClass(enumName, members);
    code += "\n\n";
  }

  const modelDoc = getDoc(program, model);
  code += `class ${model.name}(BaseModel):\n`;
  code += `${FOUR_SPACES}"""${modelDoc ?? label}"""\n`;
  code += "\n";

  for (const field of fieldDefs) {
    code += field;
  }

  return (
    <SourceFile path={fileName} filetype="py" printWidth={9999}>
      {code}
    </SourceFile>
  );
}

// ─── Pydantic field generator ───────────────────────────────────────────────

interface PydanticFieldContext {
  pyType: string;
  doc?: string;
}

function generatePydanticField(
  program: Program,
  prop: ModelProperty,
  stdImports: Set<string>,
  pydanticImports: Set<string>,
): string {
  const pyFieldName = camelToSnake(prop.name);
  const { pyType, doc } = resolvePydanticFieldContext(program, prop, stdImports, pydanticImports);
  const fieldArgs = buildPydanticFieldArgs(program, prop, doc);
  pydanticImports.add("Field");
  const docComment = doc ? `${FOUR_SPACES}# ${doc}\n` : "";
  return `${docComment}${FOUR_SPACES}${pyFieldName}: ${pyType} = Field(${fieldArgs.join(", ")})\n`;
}

function resolvePydanticFieldContext(
  program: Program,
  prop: ModelProperty,
  stdImports: Set<string>,
  pydanticImports: Set<string>,
): PydanticFieldContext {
  const dbType = resolveDbType(prop.type);
  const mapping = dbType ? getPythonTypeMap(dbType) : getPythonTypeMap("unknown");
  const enumInfo = getPropertyEnum(prop);
  const baseType = enumInfo?.enumType.name ?? mapping.pyType;

  if (!enumInfo) {
    for (const imp of mapping.imports) {
      stdImports.add(imp);
    }
  }

  return {
    pyType: prop.optional
      ? `${resolvePydanticFormatType(program, prop, baseType, pydanticImports)} | None`
      : resolvePydanticFormatType(program, prop, baseType, pydanticImports),
    doc: getDoc(program, prop),
  };
}

function resolvePydanticFormatType(
  program: Program,
  prop: ModelProperty,
  pyType: string,
  pydanticImports: Set<string>,
): string {
  const format = getFormat(program, prop);
  if (!format) {
    return pyType;
  }

  const formatType = resolveFormatPyType(format);
  if (formatType) {
    pydanticImports.add(formatType);
    return formatType;
  }

  if (format !== "") {
    reportDiagnostic(program, {
      code: "unknown-format",
      target: prop,
      format: { format, propName: prop.name },
    });
  }

  return pyType;
}

function buildPydanticFieldArgs(program: Program, prop: ModelProperty, doc?: string): string[] {
  const fieldArgs: string[] = [prop.optional ? "None" : "..."];
  pushValidationFieldArgs(program, prop, fieldArgs);

  const titleVal = getTitle(program, prop);
  if (titleVal) {
    fieldArgs.push(`title="${escapePythonString(titleVal)}"`);
  }
  if (doc) {
    fieldArgs.push(`description="${escapePythonString(doc)}"`);
  }

  const placeholder = getPlaceholder(program, prop);
  if (placeholder) {
    fieldArgs.push(`json_schema_extra={"placeholder": ${toPythonStringLiteral(placeholder)}}`);
  }

  return fieldArgs;
}

function pushValidationFieldArgs(program: Program, prop: ModelProperty, fieldArgs: string[]): void {
  const maxLen = getMaxLength(program, prop);
  const minLen = getMinLength(program, prop);
  const minVal = getMinValue(program, prop);
  const maxVal = getMaxValue(program, prop);
  const pattern = getPattern(program, prop);

  if (maxLen !== undefined) fieldArgs.push(`max_length=${maxLen}`);
  if (minLen !== undefined) fieldArgs.push(`min_length=${minLen}`);
  if (minVal !== undefined) fieldArgs.push(`ge=${minVal}`);
  if (maxVal !== undefined) fieldArgs.push(`le=${maxVal}`);
  if (pattern !== undefined) fieldArgs.push(`pattern=r"${pattern}"`);
}

function escapePythonString(value: string): string {
  return value.replaceAll(/\\/g, String.raw`\\`).replaceAll('"', String.raw`\"`);
}

function toPythonStringLiteral(value: string): string {
  return String.raw`"${escapePythonString(value)}"`;
}
