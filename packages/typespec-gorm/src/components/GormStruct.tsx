/**
 * GormStruct -JSX component for rendering a complete GORM model Go file.
 *
 * Top-level orchestrator that composes GormField, GormRelationField, GormEnum
 * into a complete Go source file wrapped in <SourceFile>.
 *
 * Uses a generate-string approach: builds the full file content as a string,
 * then wraps it in <SourceFile> for Alloy.js to write to disk.
 */

import { SourceFile } from "@alloy-js/core";
import type { Children } from "@alloy-js/core/jsx-runtime";
import type { Model, Program } from "@typespec/compiler";
import {
  getCompositeFields,
  getDoc,
  classifyProperties,
  collectCompositeTypeFields,
  isKey,
  camelToPascal,
  camelToSnake,
  resolveDbType,
  generatedHeader,
  type NormalizedOrmModel,
} from "@qninhdt/typespec-orm";
import {
  GO_TYPE_MAP,
  buildCompositeMap,
  buildImportBlock,
  buildGoEnumBlock,
  type GoPackageImport,
} from "./GormConstants.js";
import { generateFieldLine, generateIgnoredFieldLine } from "./GormField.jsx";
import { generateRelationFieldLine } from "./GormRelationField.jsx";
import type { GormEmitterOptions } from "../lib.js";

export interface GormModelFileProps {
  readonly program: Program;
  readonly normalizedModel: NormalizedOrmModel;
  readonly modelLookup: Map<Model, NormalizedOrmModel>;
  readonly libraryName?: string;
  readonly collectionStrategy?: GormEmitterOptions["collection-strategy"];
}

/**
 * JSX component: renders a complete Go source file for a GORM model.
 */
export function GormModelFile(props: GormModelFileProps): Children {
  const { program, normalizedModel, modelLookup, libraryName, collectionStrategy } = props;
  const { model, packageName } = normalizedModel;
  const tableName = normalizedModel.tableName!;
  const fileName = camelToSnake(model.name) + ".go";

  const imports = new Set<string>();
  const packageImports = new Map<string, GoPackageImport>();

  // Collect composite type fields and build composite map
  const compositeTypeFields = collectCompositeTypeFields(program, model, tableName);
  const compositeMap = buildCompositeMap(compositeTypeFields);

  // Classify properties
  const {
    enumTypes,
    ignored,
    relations,
    fields: regularProps,
  } = classifyProperties(program, model);

  // Generate field lines (populates imports as a side effect)
  const fieldLines: string[] = [];
  const relationFieldLines: string[] = [];

  // First: Key fields - always at the top
  for (const { prop } of regularProps) {
    if (isKey(program, prop)) {
      // Skip composite type fields - they are configuration only
      if (getCompositeFields(program, prop)) continue;
      fieldLines.push(generateFieldLine(program, prop, compositeMap, imports, collectionStrategy));
    }
  }

  // Second: Regular fields (excluding keys which are already output)
  for (const { prop } of regularProps) {
    if (!isKey(program, prop)) {
      // Skip composite type fields - they are configuration only
      if (getCompositeFields(program, prop)) continue;
      fieldLines.push(generateFieldLine(program, prop, compositeMap, imports, collectionStrategy));
    }
  }

  // Ignored fields → gorm:"-"
  for (const { prop, enumInfo } of ignored) {
    const dbType = resolveDbType(prop.type);
    const mapping = dbType ? GO_TYPE_MAP[dbType] : undefined;
    let goType = mapping?.goType ?? "interface{}";
    if (enumInfo) goType = camelToPascal(enumInfo.enumType.name);
    if (mapping?.imports) {
      for (const imp of mapping.imports) imports.add(imp);
    }
    fieldLines.push(generateIgnoredFieldLine(program, prop, imports, goType));
  }

  // Relation navigation fields
  for (const { prop, resolved } of relations) {
    let targetType = resolved.targetModel.name;
    const targetInfo = modelLookup.get(resolved.targetModel);
    if (targetInfo && targetInfo.namespace !== normalizedModel.namespace) {
      const alias = targetInfo.namespacePath.join("_");
      packageImports.set(alias, {
        alias,
        path: libraryName ? `${libraryName}/${targetInfo.namespaceDir}` : targetInfo.namespaceDir,
      });
      targetType = `${alias}.${resolved.targetModel.name}`;
    }
    relationFieldLines.push(generateRelationFieldLine(program, prop, resolved, targetType));
  }

  // Build enum block
  const enumLines = buildGoEnumBlock(enumTypes);

  // Build import block
  const importBlock = buildImportBlock(imports, [...packageImports.values()]);

  // Assembly
  const structName = model.name;
  const modelDoc = getDoc(program, model);
  const docLine = modelDoc
    ? `// ${structName} ${modelDoc}`
    : `// ${structName} represents the ${tableName} table.`;

  const lines: string[] = [];
  lines.push(`// ${generatedHeader}`);
  lines.push("// Source: https://github.com/qninhdt/typespec-libraries");
  lines.push("");
  lines.push(`package ${packageName}`);
  lines.push("");
  if (importBlock) lines.push(importBlock);
  if (enumLines.length > 0) lines.push(enumLines.join("\n"));
  lines.push(docLine);
  lines.push(`type ${structName} struct {`);
  lines.push(fieldLines.join(""));
  if (relationFieldLines.length > 0) {
    lines.push("\t// ─── Relationships ─────────────────────");
    lines.push(relationFieldLines.join(""));
  }
  lines.push("}");
  lines.push("");
  lines.push(`// TableName returns the table name for ${structName}.`);
  lines.push(`func (${structName}) TableName() string {`);
  lines.push(`\treturn "${tableName}"`);
  lines.push("}");
  lines.push("");

  const content = lines.join("\n");

  return (
    <SourceFile path={fileName} filetype="go" printWidth={9999}>
      {content}
    </SourceFile>
  );
}
