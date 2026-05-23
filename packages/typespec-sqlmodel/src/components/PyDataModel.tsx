/**
 * PyDataModel -JSX component for @data model → Pydantic BaseModel.
 *
 * DTOs/form models -no table, no SQLAlchemy.
 */

import { SourceFile } from "@alloy-js/core";
import type { Children } from "@alloy-js/core/jsx-runtime";
import { type Model, type Program, type Scalar, type Type } from "@typespec/compiler";
import type { EnumMemberInfo } from "@qninhdt/typespec-orm";
import {
  getDoc,
  getEnumMembers,
  getModelOwnProperties,
  isArrayType,
  getArrayElementType,
  camelToSnake,
  type NormalizedOrmModel,
} from "@qninhdt/typespec-orm";
import {
  FILE_HEADER,
  FOUR_SPACES,
  generateEnumClass,
  buildPythonImportBlock,
  pythonTripleQuotedString,
  toPythonRelativeImport,
} from "./PyConstants.js";
import { generatePydanticField } from "./py-data-fields.js";
import { collectAliasableCustomScalars } from "./py-field-utils.js";

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
  // `from __future__ import annotations` makes ALL annotations lazy strings,
  // letting forward references resolve without TYPE_CHECKING gymnastics.
  // MUST be the first import statement.
  code += "from __future__ import annotations\n\n";
  code += buildPythonImportBlock(stdImports, new Set(), pydanticImports, "pydantic");
  const allReferenced = new Set<Model>([...sourceModels, ...referencedModels]);
  code += buildReferencedModelImportBlock(allReferenced, modelLookup, namespacePath);
  if (scalarNames.length > 0) {
    // `_scalars.py` sits at the top-level package root. Walk up
    // `namespacePath.length` levels; clamp to 1 so a root-namespace model
    // (length 0) still emits `from ._scalars import ...` rather than the
    // Python-invalid `from _scalars import ...`.
    const dots = ".".repeat(Math.max(namespacePath.length, 1));
    code += `from ${dots}_scalars import ${[...new Set(scalarNames)].join(", ")}\n`;
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
