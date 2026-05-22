/**
 * PyDataModel -JSX component for @data model → Pydantic BaseModel.
 *
 * DTOs/form models -no table, no SQLAlchemy.
 */

import { SourceFile } from "@alloy-js/core";
import type { Children } from "@alloy-js/core/jsx-runtime";
import {
  getMaxLength as tsGetMaxLength,
  getMaxValue as tsGetMaxValue,
  getMaxValueExclusive as tsGetMaxValueExclusive,
  getMinLength as tsGetMinLength,
  getMinValue as tsGetMinValue,
  getMinValueExclusive as tsGetMinValueExclusive,
  getPattern as tsGetPattern,
  type Model,
  type ModelProperty,
  type Program,
  type Scalar,
  type Type,
} from "@typespec/compiler";
import type { EnumMemberInfo } from "@qninhdt/typespec-orm";
import {
  getDoc,
  getOrmScalarName,
  getMaxLength,
  getMaxValue,
  getMaxValueExclusive,
  getMinLength,
  getMinValue,
  getMinValueExclusive,
  getPattern,
  getPlaceholder,
  getEnumMembers,
  getTitle,
  getModelOwnProperties,
  isArrayType,
  getArrayElementType,
  resolveDbType,
  camelToSnake,
  isCustomScalar,
  type NormalizedOrmModel,
} from "@qninhdt/typespec-orm";
import {
  FILE_HEADER,
  FOUR_SPACES,
  getPythonTypeMap,
  generateEnumClass,
  buildPythonImportBlock,
  pythonStringLiteral,
  pythonTripleQuotedString,
  toPythonRelativeImport,
} from "./PyConstants.js";
import { getNativePydanticType, collectAliasableCustomScalars } from "./py-field-utils.js";

export interface PyDataFileProps {
  readonly program: Program;
  readonly model: Model;
  readonly label: string;
  readonly normalizedModel?: NormalizedOrmModel;
  readonly modelLookup?: Map<Model, NormalizedOrmModel>;
  readonly scalarAliasNames?: ReadonlyMap<Scalar, string>;
}

/**
 * JSX component: renders a complete Python source file for a Pydantic BaseModel.
 */
export function PyDataFile(props: PyDataFileProps): Children {
  const { program, model, label, normalizedModel, modelLookup, scalarAliasNames } = props;
  const fileName = camelToSnake(model.name) + ".py";
  const namespacePath = normalizedModel?.namespacePath ?? getModelNamespacePath(model);
  const sourceModels = normalizedModel?.mixins ?? [];

  const stdImports = new Set<string>();
  const pydanticImports = new Set<string>();
  if (sourceModels.length === 0) {
    pydanticImports.add("BaseModel");
  }
  const enumTypes = new Map<string, EnumMemberInfo[]>();
  const fieldDefs: string[] = [];
  const referencedModels = new Set<Model>();

  const allCustomScalars = collectAliasableCustomScalars(program, model);
  const scalarNames = Array.from(allCustomScalars)
    .map((s) => scalarAliasNames?.get(s) ?? s.name)
    .sort((left, right) => left.localeCompare(right));

  for (const prop of getModelOwnProperties(model)) {
    collectEnumTypes(prop.type, enumTypes);
    fieldDefs.push(
      generatePydanticField(
        program,
        prop,
        model,
        referencedModels,
        stdImports,
        pydanticImports,
        scalarAliasNames,
      ),
    );
  }
  if (enumTypes.size > 0) stdImports.add("enum.Enum");

  let code = FILE_HEADER;
  code += buildPythonImportBlock(stdImports, new Set(), pydanticImports, "pydantic");
  code += buildReferencedModelImportBlock(new Set(sourceModels), modelLookup, namespacePath);
  code += buildReferencedModelImportBlock(referencedModels, modelLookup, namespacePath);
  if (scalarNames.length > 0) {
    code += `from ${".".repeat(Math.max(namespacePath.length, 1))}_scalars import ${[...new Set(scalarNames)].join(", ")}\n`;
  }
  code += "\n\n";

  for (const [enumName, members] of enumTypes) {
    code += generateEnumClass(enumName, members);
    code += "\n\n";
  }

  const modelDoc = getDoc(program, model);
  const baseList =
    sourceModels.length > 0
      ? sourceModels
          .map((source) => source.name)
          .sort((a, b) => a.localeCompare(b))
          .join(", ")
      : "BaseModel";
  code += `class ${model.name}(${baseList}):\n`;
  code += `${FOUR_SPACES}${pythonTripleQuotedString(modelDoc ?? label)}\n`;
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
  usesScalarAlias: boolean;
}

function generatePydanticField(
  program: Program,
  prop: ModelProperty,
  currentModel: Model,
  referencedModels: Set<Model>,
  stdImports: Set<string>,
  pydanticImports: Set<string>,
  scalarAliasNames?: ReadonlyMap<Scalar, string>,
): string {
  const pyFieldName = camelToSnake(prop.name);
  const { pyType, doc, usesScalarAlias } = resolvePydanticFieldContext(
    program,
    prop,
    currentModel,
    referencedModels,
    stdImports,
    pydanticImports,
    scalarAliasNames,
  );
  const fieldArgs = buildPydanticFieldArgs(program, prop, doc, usesScalarAlias);
  pydanticImports.add("Field");
  const docComment = doc ? `${FOUR_SPACES}# ${doc}\n` : "";
  return `${docComment}${FOUR_SPACES}${pyFieldName}: ${pyType} = Field(${fieldArgs.join(", ")})\n`;
}

function resolvePydanticFieldContext(
  program: Program,
  prop: ModelProperty,
  currentModel: Model,
  referencedModels: Set<Model>,
  stdImports: Set<string>,
  pydanticImports: Set<string>,
  scalarAliasNames?: ReadonlyMap<Scalar, string>,
): PydanticFieldContext {
  const resolvedType = resolvePydanticType(
    program,
    prop,
    prop.type,
    currentModel,
    referencedModels,
    stdImports,
    pydanticImports,
    scalarAliasNames,
  );

  return {
    pyType: prop.optional ? `${resolvedType} | None` : resolvedType,
    doc: getDoc(program, prop),
    usesScalarAlias: prop.type.kind === "Scalar" && isCustomScalar(program, prop.type),
  };
}

function resolvePydanticType(
  program: Program,
  prop: ModelProperty,
  type: Type,
  currentModel: Model,
  referencedModels: Set<Model>,
  stdImports: Set<string>,
  pydanticImports: Set<string>,
  scalarAliasNames?: ReadonlyMap<Scalar, string>,
): string {
  if (type.kind === "ModelProperty") {
    return resolvePydanticType(
      program,
      prop,
      type.type,
      currentModel,
      referencedModels,
      stdImports,
      pydanticImports,
      scalarAliasNames,
    );
  }

  if (isArrayType(type)) {
    const elementType = getArrayElementType(type);
    const elementPyType = elementType
      ? resolvePydanticType(
          program,
          prop,
          elementType,
          currentModel,
          referencedModels,
          stdImports,
          pydanticImports,
          scalarAliasNames,
        )
      : "Any";
    if (!elementType) stdImports.add("typing.Any");
    return `list[${elementPyType}]`;
  }

  if (type.kind === "Model") {
    if (type === currentModel) {
      return `"${type.name}"`;
    }
    referencedModels.add(type);
    return type.name;
  }

  if (type.kind === "Enum") {
    return type.name;
  }

  const dbType = resolveDbType(type);
  const mapping = dbType ? getPythonTypeMap(dbType) : getPythonTypeMap("unknown");
  for (const imp of mapping.imports) {
    stdImports.add(imp);
  }

  if (type.kind === "Scalar" && isCustomScalar(program, type)) {
    const semanticScalarName = getOrmScalarName(type);
    const nativeType = getNativePydanticType(semanticScalarName ?? type.name);
    if (nativeType) {
      pydanticImports.add(nativeType);
      return nativeType;
    }
    return scalarAliasNames?.get(type) ?? type.name;
  }

  return mapping.pyType;
}

function getModelNamespacePath(model: Model): string[] {
  const segments: string[] = [];
  let current = model.namespace;
  while (current && current.name !== "") {
    segments.push(camelToSnake(current.name));
    current = current.namespace;
  }
  return segments.reverse();
}

function collectEnumTypes(type: Type, enumTypes: Map<string, EnumMemberInfo[]>): void {
  if (type.kind === "ModelProperty") {
    collectEnumTypes(type.type, enumTypes);
    return;
  }
  if (isArrayType(type)) {
    const elementType = getArrayElementType(type);
    if (elementType) collectEnumTypes(elementType, enumTypes);
    return;
  }
  if (type.kind === "Enum") {
    if (!enumTypes.has(type.name)) {
      enumTypes.set(type.name, getEnumMembers(type));
    }
  }
}

function buildReferencedModelImportBlock(
  referencedModels: Set<Model>,
  modelLookup: Map<Model, NormalizedOrmModel> | undefined,
  namespacePath: string[],
): string {
  if (referencedModels.size === 0) {
    return "";
  }

  let code = "";
  for (const targetModel of [...referencedModels].sort((a, b) => a.name.localeCompare(b.name))) {
    const targetInfo = modelLookup?.get(targetModel);
    if (!targetInfo) continue;
    code += `from ${toPythonRelativeImport(namespacePath, targetInfo.namespacePath, camelToSnake(targetModel.name))} import ${targetModel.name}\n`;
  }
  if (code) code += "\n";
  return code;
}

function buildPydanticFieldArgs(
  program: Program,
  prop: ModelProperty,
  doc: string | undefined,
  usesScalarAlias: boolean,
): string[] {
  const fieldArgs: string[] = [prop.optional ? "None" : "..."];
  pushValidationFieldArgs(program, prop, fieldArgs, usesScalarAlias);

  const titleVal = getTitle(program, prop);
  if (titleVal) {
    fieldArgs.push(`title=${pythonStringLiteral(titleVal)}`);
  }
  if (doc) {
    fieldArgs.push(`description=${pythonStringLiteral(doc)}`);
  }

  const placeholder = getPlaceholder(program, prop);
  if (placeholder) {
    fieldArgs.push(`json_schema_extra={"placeholder": ${pythonStringLiteral(placeholder)}}`);
  }

  return fieldArgs;
}

function pushValidationFieldArgs(
  program: Program,
  prop: ModelProperty,
  fieldArgs: string[],
  usesScalarAlias: boolean,
): void {
  // When using a scalar alias, only read constraints directly applied on the
  // property itself (raw TypeSpec getters). Constraints inherited from the scalar
  // definition are already in _scalars.py — don't duplicate them.
  const maxLen = usesScalarAlias ? tsGetMaxLength(program, prop) : getMaxLength(program, prop);
  const minLen = usesScalarAlias ? tsGetMinLength(program, prop) : getMinLength(program, prop);
  const minVal = usesScalarAlias ? tsGetMinValue(program, prop) : getMinValue(program, prop);
  const maxVal = usesScalarAlias ? tsGetMaxValue(program, prop) : getMaxValue(program, prop);
  const minValExcl = usesScalarAlias
    ? tsGetMinValueExclusive(program, prop)
    : getMinValueExclusive(program, prop);
  const maxValExcl = usesScalarAlias
    ? tsGetMaxValueExclusive(program, prop)
    : getMaxValueExclusive(program, prop);
  const pattern = usesScalarAlias ? tsGetPattern(program, prop) : getPattern(program, prop);

  if (maxLen !== undefined) fieldArgs.push(`max_length=${maxLen}`);
  if (minLen !== undefined) fieldArgs.push(`min_length=${minLen}`);
  if (minValExcl !== undefined) fieldArgs.push(`gt=${minValExcl}`);
  else if (minVal !== undefined) fieldArgs.push(`ge=${minVal}`);
  if (maxValExcl !== undefined) fieldArgs.push(`lt=${maxValExcl}`);
  else if (maxVal !== undefined) fieldArgs.push(`le=${maxVal}`);
  if (pattern !== undefined) fieldArgs.push(`pattern=${pythonStringLiteral(pattern)}`);
}
