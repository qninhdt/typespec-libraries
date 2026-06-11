import type { Model, ModelProperty, Program, Scalar, Type } from "@typespec/compiler";
import {
  camelToSnake,
  getDoc,
  getOrmScalarName,
  getPlaceholder,
  getTitle,
  isArrayType,
  getArrayElementType,
  resolveDbType,
  isCustomScalar,
} from "@qninhdt/typespec-orm";
import { FOUR_SPACES, getPythonTypeMap, pythonStringLiteral } from "./PyConstants.js";
import { getNativePydanticType } from "./py-field-utils.js";
import { getEffectivePropertyConstraints } from "./py-property-constraints.js";

interface PydanticFieldContext {
  pyType: string;
  doc?: string;
  usesScalarAlias: boolean;
}

export function generatePydanticField(
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
  // property itself. Constraints inherited from the scalar definition are
  // already in _scalars.py — don't duplicate them.
  const { maxLen, minLen, minVal, maxVal, minValExcl, maxValExcl, pattern } =
    getEffectivePropertyConstraints(program, prop, { useDirect: usesScalarAlias });

  if (maxLen !== undefined) fieldArgs.push(`max_length=${maxLen}`);
  if (minLen !== undefined) fieldArgs.push(`min_length=${minLen}`);
  if (minValExcl !== undefined) fieldArgs.push(`gt=${minValExcl}`);
  else if (minVal !== undefined) fieldArgs.push(`ge=${minVal}`);
  if (maxValExcl !== undefined) fieldArgs.push(`lt=${maxValExcl}`);
  else if (maxVal !== undefined) fieldArgs.push(`le=${maxVal}`);
  if (pattern !== undefined) fieldArgs.push(`pattern=${pythonStringLiteral(pattern)}`);
}
