/**
 * GormDataStruct -JSX component for @data model Go structs.
 *
 * These are DTOs/form models -no GORM tags, no TableName() method.
 * Uses validate + json + form struct tags only.
 */

import { SourceFile } from "@alloy-js/core";
import type { Children } from "@alloy-js/core/jsx-runtime";
import type { Model, ModelProperty, Program } from "@typespec/compiler";
import type { EnumMemberInfo } from "@qninhdt/typespec-orm";
import {
  getDoc,
  getPlaceholder,
  getPropertyEnum,
  getTitle,
  resolveDbType,
  camelToPascal,
  camelToSnake,
  generatedHeader,
} from "@qninhdt/typespec-orm";
import {
  GO_TYPE_MAP,
  escapeFormTagValue,
  buildImportBlock,
  buildDocComment,
  buildGoEnumBlock,
} from "./GormConstants.js";
import { buildValidateTag } from "./GormValidateTag.js";

export interface GormDataFileProps {
  readonly program: Program;
  readonly model: Model;
  readonly label: string;
  readonly packageName: string;
}

/**
 * JSX component: renders a complete Go source file for a @data model.
 */
export function GormDataFile(props: GormDataFileProps): Children {
  const { program, model, label, packageName } = props;
  const fileName = camelToSnake(model.name) + ".go";

  const imports = new Set<string>();
  const fieldLineStrs: string[] = [];
  const enumTypes = new Map<string, EnumMemberInfo[]>();

  for (const [, prop] of model.properties) {
    const enumInfo = getPropertyEnum(prop);
    if (enumInfo && !enumTypes.has(enumInfo.enumType.name)) {
      enumTypes.set(enumInfo.enumType.name, enumInfo.members);
    }
    fieldLineStrs.push(generateDataFieldLine(program, prop, imports));
  }

  const structName = model.name;
  const modelDoc = getDoc(program, model);

  // Build enum block using shared helper
  const enumLines = buildGoEnumBlock(enumTypes);

  // Build import block
  const importBlock = buildImportBlock(imports);

  const docComment = `// ${structName} ${modelDoc ?? label}`;

  // Assemble the full file
  const lines: string[] = [];
  lines.push(`// ${generatedHeader}`);
  lines.push("// Source: https://github.com/qninhdt/typespec-libraries");
  lines.push("");
  lines.push(`package ${packageName}`);
  lines.push("");
  if (importBlock) lines.push(importBlock);
  if (enumLines.length > 0) lines.push(enumLines.join("\n"));
  lines.push(docComment);
  lines.push(`type ${structName} struct {`);
  lines.push(fieldLineStrs.join(""));
  lines.push("}");
  lines.push("");

  const content = lines.join("\n");

  return (
    <SourceFile path={fileName} filetype="go" printWidth={9999}>
      {content}
    </SourceFile>
  );
}

// ─── Data field line generator ──────────────────────────────────────────────

function generateDataFieldLine(
  program: Program,
  prop: ModelProperty,
  imports: Set<string>,
): string {
  const fieldName = camelToPascal(prop.name);
  const dbType = resolveDbType(prop.type);
  const mapping = dbType ? GO_TYPE_MAP[dbType] : undefined;

  const enumInfo = getPropertyEnum(prop);
  let goType = mapping?.goType ?? "interface{}";
  if (enumInfo) goType = camelToPascal(enumInfo.enumType.name);
  if (mapping?.imports) {
    for (const imp of mapping.imports) imports.add(imp);
  }

  const isOpt = prop.optional;
  const finalGoType =
    isOpt && !goType.startsWith("*") && !goType.startsWith("[]") ? `*${goType}` : goType;

  const validateTag = buildValidateTag(program, prop);
  const jsonOmit = isOpt ? ",omitempty" : "";
  const doc = getDoc(program, prop);

  const title = getTitle(program, prop);
  const placeholder = getPlaceholder(program, prop);
  const labelTag = buildFormTag(prop.name, title, placeholder);

  const structTags = validateTag
    ? `validate:"${validateTag}" json:"${prop.name}${jsonOmit}"${labelTag}`
    : `json:"${prop.name}${jsonOmit}"${labelTag}`;

  const docComment = buildDocComment(doc);
  return `${docComment}\t${fieldName} ${finalGoType} \`${structTags}\`\n`;
}

function buildFormTag(
  propName: string,
  title: string | undefined,
  placeholder: string | undefined,
): string {
  if (!title && !placeholder) {
    return "";
  }

  const formParts = [propName];
  if (title) {
    formParts.push(`title=${escapeFormTagValue(title)}`);
  }
  if (placeholder) {
    formParts.push(`placeholder=${escapeFormTagValue(placeholder)}`);
  }

  return ` form:"${formParts.join(",")}"`;
}
