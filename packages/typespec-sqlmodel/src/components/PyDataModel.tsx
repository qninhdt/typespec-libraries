/**
 * PyDataModel — JSX component for @data model → Pydantic BaseModel.
 *
 * DTOs/form models — no table, no SQLAlchemy.
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

function generatePydanticField(
  program: Program,
  prop: ModelProperty,
  stdImports: Set<string>,
  pydanticImports: Set<string>,
): string {
  const pyFieldName = camelToSnake(prop.name);
  const dbType = resolveDbType(prop.type);
  const mapping = dbType ? getPythonTypeMap(dbType) : getPythonTypeMap("unknown");

  const enumInfo = getPropertyEnum(prop);
  let pyType = mapping.pyType;
  if (enumInfo) {
    pyType = enumInfo.enumType.name;
  } else {
    for (const imp of mapping.imports) stdImports.add(imp);
  }

  // Format-based type overrides
  const format = getFormat(program, prop);
  if (format === "email") {
    pydanticImports.add("EmailStr");
    pyType = "EmailStr";
  } else if (format === "url" || format === "uri") {
    pydanticImports.add("AnyUrl");
    pyType = "AnyUrl";
  } else if (format !== undefined && format !== null && format !== "") {
    reportDiagnostic(program, {
      code: "unknown-format",
      target: prop,
      format: { format, propName: prop.name },
    });
  }

  const isOpt = prop.optional;
  if (isOpt) {
    stdImports.add("typing.Optional");
    pyType = `Optional[${pyType}]`;
  }

  const fieldArgs: string[] = [isOpt ? "None" : "..."];

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

  const titleVal = getTitle(program, prop);
  if (titleVal) fieldArgs.push(`title="${titleVal.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`);

  const doc = getDoc(program, prop);
  if (doc) fieldArgs.push(`description="${doc.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`);

  const placeholder = getPlaceholder(program, prop);
  if (placeholder)
    fieldArgs.push(
      `json_schema_extra={"placeholder": "${placeholder.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"}`,
    );

  pydanticImports.add("Field");

  const docComment = doc ? `${FOUR_SPACES}# ${doc}\n` : "";
  return `${docComment}${FOUR_SPACES}${pyFieldName}: ${pyType} = Field(${fieldArgs.join(", ")})\n`;
}
