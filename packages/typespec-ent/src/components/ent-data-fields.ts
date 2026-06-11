import { type Model, type ModelProperty, type Program, type Type } from "@typespec/compiler";
import {
  camelToPascal,
  getArrayElementType,
  getDoc,
  getEnumMembers,
  getOrmScalarName,
  getPlaceholder,
  getTitle,
  isArrayType,
  isCustomScalar,
  resolveDbType,
  type EnumMemberInfo,
  type NormalizedOrmModel,
} from "@qninhdt/typespec-orm";
import { GO_TYPE_MAP, escapeFormTagValue, type GoPackageImport } from "./EntConstants.js";
import { buildDocComment } from "./ent-string-utils.js";
import { buildValidateTag } from "./EntValidateTag.js";
import { reportDiagnostic } from "../lib.js";

/**
 * Build embedded mixin field lines for a `@data` struct: each mixin sourced
 * from a different namespace becomes an aliased Go package import plus an
 * unnamed embedded field.
 */
export function buildEmbeddedSourceFields(
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

/**
 * Generate one Go struct field line for a `@data` model property, or undefined
 * when the property maps to an unsupported type (a diagnostic is reported in
 * that case).
 */
export function generateDataFieldLine(
  program: Program,
  prop: ModelProperty,
  currentModel: Model,
  currentInfo: NormalizedOrmModel | undefined,
  modelLookup: Map<Model, NormalizedOrmModel> | undefined,
  libraryName: string | undefined,
  imports: Set<string>,
  packageImports: Map<string, GoPackageImport>,
): string | undefined {
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

  if (goType === undefined) {
    reportDiagnostic(program, {
      code: "unsupported-type",
      target: prop,
      format: { typeName: prop.type.kind, propName: prop.name },
    });
    return undefined;
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
): string | undefined {
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
    if (!elementType) return undefined;
    const elementGoType = resolveGoDataType(
      program,
      prop,
      elementType,
      currentModel,
      currentInfo,
      modelLookup,
      libraryName,
      imports,
      packageImports,
    );
    if (elementGoType === undefined) return undefined;
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
  let goType = mapping?.goType;

  if (type.kind === "Scalar" && isCustomScalar(program, type)) {
    const semanticScalarName = getOrmScalarName(type);
    if (!semanticScalarName && !mapping) {
      goType = camelToPascal(type.name);
    }
  }

  if (goType === undefined) {
    return undefined;
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

/**
 * Walk a property type and collect every distinct enum encountered. Used to
 * emit per-package `enums.go` files alongside data structs.
 */
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
