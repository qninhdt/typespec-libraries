/**
 * EntDataStruct -JSX component for @data model Go structs.
 *
 * These are DTOs/form models -no Ent tags, no TableName() method.
 * Uses validate + json + form struct tags only.
 */

import { SourceFile } from "@alloy-js/core";
import type { Children } from "@alloy-js/core/jsx-runtime";
import { type Model, type Program } from "@typespec/compiler";
import type { EnumMemberInfo } from "@qninhdt/typespec-orm";
import {
  camelToSnake,
  generatedHeader,
  getDoc,
  getModelOwnProperties,
  isIgnored,
  type NormalizedOrmModel,
} from "@qninhdt/typespec-orm";
import { buildImportBlock, type GoPackageImport } from "./ent-imports.js";
import { buildGoEnumBlock } from "./ent-enum.js";
import {
  buildEmbeddedSourceFields,
  collectGoEnumTypes,
  generateDataFieldLine,
} from "./ent-data-fields.js";

export { collectGoEnumTypes } from "./ent-data-fields.js";

export interface EntDataFileProps {
  readonly program: Program;
  readonly model: Model;
  readonly label: string;
  readonly packageName: string;
  readonly normalizedModel?: NormalizedOrmModel;
  readonly modelLookup?: Map<Model, NormalizedOrmModel>;
  readonly libraryName?: string;
  readonly emitEnums?: boolean;
}

/**
 * JSX component: renders a complete Go source file for a @data model.
 */
export function EntDataFile(props: EntDataFileProps): Children {
  const { program, model, label, packageName, normalizedModel, modelLookup, libraryName } = props;
  const fileName = camelToSnake(model.name) + ".go";

  const imports = new Set<string>();
  const packageImports = new Map<string, GoPackageImport>();
  const fieldLineStrs: string[] = [];
  const enumTypes = new Map<string, EnumMemberInfo[]>();

  const embeddedFieldLines = buildEmbeddedSourceFields(
    normalizedModel,
    modelLookup,
    libraryName,
    packageImports,
  );

  const shouldCollectEnums = props.emitEnums !== false;
  let hasUnsupported = false;
  for (const prop of getModelOwnProperties(model)) {
    // Mirror EntSchema's @ignore handling: ignored properties are excluded
    // from data structs entirely (no field, no enum collection).
    if (isIgnored(program, prop)) continue;
    if (shouldCollectEnums) collectGoEnumTypes(prop.type, enumTypes);
    const line = generateDataFieldLine(
      program,
      prop,
      model,
      normalizedModel,
      modelLookup,
      libraryName,
      imports,
      packageImports,
    );
    if (line === undefined) {
      hasUnsupported = true;
      continue;
    }
    fieldLineStrs.push(line);
  }

  // Strict-by-default: when any property maps to no Go type, abort the file
  // instead of silently emitting `interface{}`. The diagnostic was already
  // reported inside generateDataFieldLine.
  if (hasUnsupported) {
    return null;
  }

  const structName = model.name;
  const modelDoc = getDoc(program, model);

  // Build enum block using shared helper
  const enumLines = props.emitEnums === false ? [] : buildGoEnumBlock(enumTypes);

  // Build import block
  const importBlock = buildImportBlock(imports, [...packageImports.values()]);

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
  if (embeddedFieldLines.length > 0) lines.push(embeddedFieldLines.join("").replace(/\n$/, ""));
  if (fieldLineStrs.length > 0) lines.push(fieldLineStrs.join("").replace(/\n$/, ""));
  lines.push("}");
  lines.push("");

  const content = lines.join("\n");

  return (
    <SourceFile path={fileName} filetype="go" printWidth={9999}>
      {content}
    </SourceFile>
  );
}
