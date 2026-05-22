/**
 * EntDataStruct -JSX component for @data model Go structs.
 *
 * These are DTOs/form models -no Ent tags, no TableName() method.
 * Uses validate + json + form struct tags only.
 */

import { SourceFile } from "@alloy-js/core";
import type { Children } from "@alloy-js/core/jsx-runtime";
import { type Model, type ModelProperty, type Program, type Type } from "@typespec/compiler";
import type { EnumMemberInfo } from "@qninhdt/typespec-orm";
import {
  getArrayElementType,
  getDoc,
  getEnumMembers,
  getOrmScalarName,
  getPlaceholder,
  getTitle,
  getModelOwnProperties,
  isArrayType,
  resolveDbType,
  camelToPascal,
  camelToSnake,
  generatedHeader,
  isCustomScalar,
  type NormalizedOrmModel,
} from "@qninhdt/typespec-orm";
import {
  GO_TYPE_MAP,
  escapeFormTagValue,
  buildImportBlock,
  buildDocComment,
  buildGoEnumBlock,
  type GoPackageImport,
} from "./EntConstants.js";
import { buildValidateTag } from "./EntValidateTag.js";

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

  for (const prop of getModelOwnProperties(model)) {
    collectGoEnumTypes(prop.type, enumTypes);
    fieldLineStrs.push(
      generateDataFieldLine(
        program,
        prop,
        model,
        normalizedModel,
        modelLookup,
        libraryName,
        imports,
        packageImports,
      ),
    );
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

function buildEmbeddedSourceFields(
  currentInfo: NormalizedOrmModel | undefined,
  modelLookup: Map<Model, NormalizedOrmModel> | undefined,
  libraryName: string | undefined,
  packageImports: Map<string, GoPackageImport>,
): string[] {
  if (!currentInfo || !modelLookup) {
    return [];
  }

  return currentInfo.mixins.map((sourceModel) => {
    const sourceInfo = modelLookup.get(sourceModel);
    let typeName = sourceModel.name;
    if (sourceInfo && sourceInfo.namespace !== currentInfo.namespace) {
      const alias = sourceInfo.namespacePath.join("_");
      packageImports.set(alias, {
        alias,
        path: libraryName ? `${libraryName}/${sourceInfo.namespaceDir}` : sourceInfo.namespaceDir,
      });
      typeName = `${alias}.${sourceModel.name}`;
    }
    return `\t${typeName}\n`;
  });
}

// ─── Data field line generator ──────────────────────────────────────────────

function generateDataFieldLine(
  program: Program,
  prop: ModelProperty,
  currentModel: Model,
  currentInfo: NormalizedOrmModel | undefined,
  modelLookup: Map<Model, NormalizedOrmModel> | undefined,
  libraryName: string | undefined,
  imports: Set<string>,
  packageImports: Map<string, GoPackageImport>,
): string {
  const fieldName = camelToPascal(prop.name);
  const goType = resolveGoDataType(
    program,
    prop,
    prop.type,
    currentModel,
    currentInfo,
    modelLookup,
    libraryName,
    imports,
    packageImports,
  );

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

function resolveGoDataType(
  program: Program,
  prop: ModelProperty,
  type: Type,
  currentModel: Model,
  currentInfo: NormalizedOrmModel | undefined,
  modelLookup: Map<Model, NormalizedOrmModel> | undefined,
  libraryName: string | undefined,
  imports: Set<string>,
  packageImports: Map<string, GoPackageImport>,
): string {
  if (type.kind === "ModelProperty") {
    return resolveGoDataType(
      program,
      prop,
      type.type,
      currentModel,
      currentInfo,
      modelLookup,
      libraryName,
      imports,
      packageImports,
    );
  }

  if (isArrayType(type)) {
    const elementType = getArrayElementType(type);
    const elementGoType = elementType
      ? resolveGoDataType(
          program,
          prop,
          elementType,
          currentModel,
          currentInfo,
          modelLookup,
          libraryName,
          imports,
          packageImports,
        )
      : "interface{}";
    return `[]${elementGoType}`;
  }

  if (type.kind === "Enum") {
    return camelToPascal(type.name);
  }

  if (type.kind === "Model") {
    return resolveGoModelType(
      type,
      currentModel,
      currentInfo,
      modelLookup,
      libraryName,
      packageImports,
    );
  }

  const dbType = resolveDbType(type);
  const mapping = dbType ? GO_TYPE_MAP[dbType] : undefined;
  let goType = mapping?.goType ?? "interface{}";

  if (type.kind === "Scalar" && isCustomScalar(program, type)) {
    const semanticScalarName = getOrmScalarName(type);
    if (!semanticScalarName && !mapping) {
      goType = camelToPascal(type.name);
    }
  }

  if (mapping?.imports) {
    for (const imp of mapping.imports) imports.add(imp);
  }

  return goType;
}

function resolveGoModelType(
  targetModel: Model,
  currentModel: Model,
  currentInfo: NormalizedOrmModel | undefined,
  modelLookup: Map<Model, NormalizedOrmModel> | undefined,
  libraryName: string | undefined,
  packageImports: Map<string, GoPackageImport>,
): string {
  if (targetModel === currentModel) {
    return targetModel.name;
  }

  const targetInfo = modelLookup?.get(targetModel);
  if (!targetInfo || targetInfo.namespace === currentInfo?.namespace) {
    return targetModel.name;
  }

  const alias = targetInfo.namespacePath.join("_");
  packageImports.set(alias, {
    alias,
    path: libraryName ? `${libraryName}/${targetInfo.namespaceDir}` : targetInfo.namespaceDir,
  });
  return `${alias}.${targetModel.name}`;
}

export function collectGoEnumTypes(type: Type, enumTypes: Map<string, EnumMemberInfo[]>): void {
  if (type.kind === "ModelProperty") {
    collectGoEnumTypes(type.type, enumTypes);
    return;
  }
  if (isArrayType(type)) {
    const elementType = getArrayElementType(type);
    if (elementType) collectGoEnumTypes(elementType, enumTypes);
    return;
  }
  if (type.kind === "Enum" && !enumTypes.has(type.name)) {
    enumTypes.set(type.name, getEnumMembers(type));
  }
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
