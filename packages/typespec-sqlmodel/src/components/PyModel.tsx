/**
 * PyModel -JSX component for rendering a complete SQLModel Python file.
 *
 * Top-level orchestrator that wraps content in <SourceFile>.
 */

import { SourceFile } from "@alloy-js/core";
import type { Children } from "@alloy-js/core/jsx-runtime";
import type { Model, ModelProperty, Program } from "@typespec/compiler";
import {
  getColumnName,
  getCheck,
  getCompositeFields,
  getDoc,
  classifyProperties,
  collectCompositeTypeFields,
  buildCompositeUniqueColumns,
  camelToSnake,
  type NormalizedOrmModel,
} from "@qninhdt/typespec-orm";
import {
  FILE_HEADER,
  FOUR_SPACES,
  generateEnumClass,
  buildPythonImportBlock,
} from "./PyConstants.js";
import { generateField, generateIgnoredField } from "./PyField.jsx";
import type { ResolvedForeignKeyFieldInfo } from "./PyField.jsx";
import { generateRelationField } from "./PyRelationField.jsx";
import type { SqlModelEmitterOptions } from "../lib.js";

export interface PyModelFileProps {
  readonly program: Program;
  readonly normalizedModel: NormalizedOrmModel;
  readonly modelLookup: Map<Model, NormalizedOrmModel>;
  readonly collectionStrategy?: SqlModelEmitterOptions["collection-strategy"];
  readonly manyToManySecondaryByProp?: Map<ModelProperty, string>;
  readonly runtimeImports?: Map<string, Set<string>>;
}

interface RegularFieldContext {
  program: Program;
  regularProps: ReturnType<typeof classifyProperties>["fields"];
  compositeUniqueColumns: Set<string>;
  fkInfoMap: Map<string, ResolvedForeignKeyFieldInfo>;
  stdImports: Set<string>;
  saImports: Set<string>;
  sqlmodelImports: Set<string>;
  needsField: { value: boolean };
  needsColumn: { value: boolean };
  fieldDefs: string[];
  collectionStrategy?: SqlModelEmitterOptions["collection-strategy"];
}

interface PyModelRenderContext {
  program: Program;
  model: Model;
  tableName: string;
  enumTypes: ReturnType<typeof classifyProperties>["enumTypes"];
  stdImports: Set<string>;
  saImports: Set<string>;
  sqlmodelImports: Set<string>;
  runtimeImports?: Map<string, Set<string>>;
  relationTargetModels: Set<Model>;
  modelLookup: Map<Model, NormalizedOrmModel>;
  namespacePath: string[];
  tableArgEntries: string[];
  fieldDefs: string[];
  relationDefs: string[];
}

/**
 * JSX component: renders a complete Python source file for a SQLModel class.
 */
export function PyModelFile(props: PyModelFileProps): Children {
  const {
    program,
    normalizedModel,
    modelLookup,
    collectionStrategy,
    manyToManySecondaryByProp,
    runtimeImports,
  } = props;
  const { model } = normalizedModel;
  const tableName = normalizedModel.tableName!;
  const fileName = camelToSnake(model.name) + ".py";

  const stdImports = new Set<string>();
  const saImports = new Set<string>();
  const sqlmodelImports = new Set<string>(["SQLModel", "Field"]);
  const needsField = { value: false };
  const needsColumn = { value: false };

  // Classify properties
  const {
    enumTypes,
    ignored,
    relations,
    fields: regularProps,
  } = classifyProperties(program, model);
  const compositeTypeFields = collectCompositeTypeFields(program, model, tableName);
  const compositeUniqueColumns = buildCompositeUniqueColumns(compositeTypeFields);
  const fkInfoMap = buildForeignKeyInfoMap(model, relations);
  const fieldDefs: string[] = [];
  const relationDefs: string[] = [];
  const relationTargetModels = new Set<Model>();
  const tableArgEntries = buildTableArgEntries(program, model, compositeTypeFields, saImports);

  addIgnoredFields(program, ignored, fieldDefs, stdImports);
  addRelationFields(
    program,
    relations,
    relationDefs,
    relationTargetModels,
    stdImports,
    sqlmodelImports,
    manyToManySecondaryByProp,
  );
  addRegularFields({
    program,
    regularProps,
    compositeUniqueColumns,
    fkInfoMap,
    stdImports,
    saImports,
    sqlmodelImports,
    needsField,
    needsColumn,
    fieldDefs,
    collectionStrategy,
  });
  addEnumImports(enumTypes, stdImports, saImports);

  const code = buildPyModelCode({
    program,
    model,
    tableName,
    enumTypes,
    stdImports,
    saImports,
    sqlmodelImports,
    runtimeImports,
    relationTargetModels,
    modelLookup,
    namespacePath: normalizedModel.namespacePath,
    tableArgEntries,
    fieldDefs,
    relationDefs,
  });

  return (
    <SourceFile path={fileName} filetype="py" printWidth={9999}>
      {code}
    </SourceFile>
  );
}

function addRegularFields(context: RegularFieldContext): void {
  const {
    program,
    regularProps,
    compositeUniqueColumns,
    fkInfoMap,
    stdImports,
    saImports,
    sqlmodelImports,
    needsField,
    needsColumn,
    fieldDefs,
    collectionStrategy,
  } = context;
  for (const { prop } of regularProps) {
    if (getCompositeFields(program, prop)) continue;

    const columnName = getColumnName(program, prop);
    fieldDefs.push(
      generateField(
        program,
        prop,
        stdImports,
        saImports,
        sqlmodelImports,
        needsField,
        needsColumn,
        compositeUniqueColumns.has(columnName),
        fkInfoMap.get(columnName),
        collectionStrategy,
      ),
    );
  }
}

function buildTableArgEntries(
  program: Program,
  model: Model,
  compositeTypeFields: ReturnType<typeof collectCompositeTypeFields>,
  saImports: Set<string>,
): string[] {
  const tableArgEntries = buildCompositeTableArgEntries(compositeTypeFields, saImports);
  addCheckConstraints(program, model, saImports, tableArgEntries);
  return tableArgEntries;
}

function buildCompositeTableArgEntries(
  compositeTypeFields: ReturnType<typeof collectCompositeTypeFields>,
  saImports: Set<string>,
): string[] {
  const tableArgEntries: string[] = [];
  let hasIndex = false;
  let hasUniqueConstraint = false;

  for (const ct of compositeTypeFields) {
    const cols = ct.columns.map((column) => `"${camelToSnake(column)}"`).join(", ");
    if (ct.isPrimary || ct.isUnique) {
      hasUniqueConstraint = true;
      tableArgEntries.push(
        `${FOUR_SPACES}${FOUR_SPACES}UniqueConstraint(${cols}, name="${camelToSnake(ct.name)}")`,
      );
      continue;
    }

    hasIndex = true;
    tableArgEntries.push(`${FOUR_SPACES}${FOUR_SPACES}Index("${camelToSnake(ct.name)}", ${cols})`);
  }

  if (hasIndex) saImports.add("sqlalchemy.Index");
  if (hasUniqueConstraint) saImports.add("sqlalchemy.UniqueConstraint");
  return tableArgEntries;
}

function addCheckConstraints(
  program: Program,
  model: Model,
  saImports: Set<string>,
  tableArgEntries: string[],
): void {
  for (const prop of model.properties.values()) {
    const check = getCheck(program, prop);
    if (!check) continue;

    saImports.add("sqlalchemy.CheckConstraint");
    tableArgEntries.push(
      `${FOUR_SPACES}${FOUR_SPACES}CheckConstraint(${JSON.stringify(check.expression)}, name=${JSON.stringify(check.name)})`,
    );
  }
}

function addEnumImports(
  enumTypes: ReturnType<typeof classifyProperties>["enumTypes"],
  stdImports: Set<string>,
  saImports: Set<string>,
): void {
  if (enumTypes.size === 0) {
    return;
  }

  stdImports.add("enum.Enum");
  saImports.add("sqlalchemy.Enum as SAEnum");
}

function buildPyModelCode(context: PyModelRenderContext): string {
  const {
    program,
    model,
    tableName,
    enumTypes,
    stdImports,
    saImports,
    sqlmodelImports,
    runtimeImports,
    relationTargetModels,
    modelLookup,
    namespacePath,
    tableArgEntries,
    fieldDefs,
    relationDefs,
  } = context;
  let code = FILE_HEADER;
  code += buildPythonImportBlock(stdImports, saImports, sqlmodelImports, "sqlmodel");
  code += buildRuntimeImportBlock(runtimeImports);
  code += buildTypeCheckingBlock(relationTargetModels, modelLookup, namespacePath);
  code += "\n\n";
  code += buildEnumClasses(enumTypes);
  code += buildModelClass(program, model, tableName, tableArgEntries, fieldDefs, relationDefs);
  return code;
}

function buildEnumClasses(enumTypes: ReturnType<typeof classifyProperties>["enumTypes"]): string {
  let code = "";
  for (const [enumName, members] of enumTypes) {
    code += generateEnumClass(enumName, members);
    code += "\n\n";
  }
  return code;
}

function buildModelClass(
  program: Program,
  model: Model,
  tableName: string,
  tableArgEntries: string[],
  fieldDefs: string[],
  relationDefs: string[],
): string {
  const modelDoc = getDoc(program, model) ?? `Represents the ${tableName} table.`;
  let code = `class ${model.name}(SQLModel, table=True):\n`;
  code += `${FOUR_SPACES}"""${modelDoc}"""\n\n`;
  code += `${FOUR_SPACES}__tablename__ = "${tableName}" # type: ignore \n`;

  if (tableArgEntries.length > 0) {
    code += `${FOUR_SPACES}__table_args__ = (\n`;
    code += tableArgEntries.join(",\n") + ",\n";
    code += `${FOUR_SPACES})\n`;
  }

  code += "\n";
  code += fieldDefs.join("");

  if (relationDefs.length > 0) {
    code += `\n${FOUR_SPACES}# ─── Relationships ─────────────────────\n`;
    code += relationDefs.join("");
  }

  return code;
}

function addIgnoredFields(
  program: Program,
  ignored: ReturnType<typeof classifyProperties>["ignored"],
  fieldDefs: string[],
  stdImports: Set<string>,
): void {
  for (const { prop, enumInfo } of ignored) {
    fieldDefs.push(generateIgnoredField(program, prop, stdImports, enumInfo));
  }
}

function addRelationFields(
  program: Program,
  relations: ReturnType<typeof classifyProperties>["relations"],
  relationDefs: string[],
  relationTargetModels: Set<Model>,
  stdImports: Set<string>,
  sqlmodelImports: Set<string>,
  manyToManySecondaryByProp: Map<ModelProperty, string> | undefined,
): void {
  for (const { prop, resolved } of relations) {
    sqlmodelImports.add("Relationship");
    const secondary =
      resolved.kind === "many-to-many" ? manyToManySecondaryByProp?.get(prop) : undefined;
    const { field, targetModel } = generateRelationField(program, prop, resolved, secondary);
    relationDefs.push(field);
    relationTargetModels.add(targetModel);
    stdImports.add("TYPE_CHECKING");
  }
}

function buildForeignKeyInfoMap(
  model: Model,
  relations: ReturnType<typeof classifyProperties>["relations"],
): Map<string, ResolvedForeignKeyFieldInfo> {
  const fkInfoMap = new Map<string, ResolvedForeignKeyFieldInfo>();
  for (const { resolved } of relations) {
    if (resolved.kind === "many-to-many" || resolved.localProperty.model !== model) {
      continue;
    }

    fkInfoMap.set(camelToSnake(resolved.fkColumnName), {
      targetTable: resolved.targetTable,
      targetColumn: resolved.fkTargetColumn,
      onDelete: resolved.onDelete,
      onUpdate: resolved.onUpdate,
    });
  }

  return fkInfoMap;
}

function buildRuntimeImportBlock(runtimeImports?: Map<string, Set<string>>): string {
  if (!runtimeImports || runtimeImports.size === 0) {
    return "";
  }

  let code = "\n";
  for (const [moduleName, names] of [...runtimeImports.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    code += `from ${moduleName} import ${[...names].sort((a, b) => a.localeCompare(b)).join(", ")}\n`;
  }
  return code;
}

function buildTypeCheckingBlock(
  relationTargetModels: Set<Model>,
  modelLookup: Map<Model, NormalizedOrmModel>,
  namespacePath: string[],
): string {
  if (relationTargetModels.size === 0) {
    return "";
  }

  let code = "\nif TYPE_CHECKING:\n";
  for (const targetModel of [...relationTargetModels].sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const targetInfo = modelLookup.get(targetModel);
    if (!targetInfo) continue;
    code += `    from ${toPythonRelativeImport(namespacePath, targetInfo.namespacePath, camelToSnake(targetModel.name))} import ${targetModel.name}\n`;
  }
  return code;
}

function toPythonRelativeImport(
  fromSegments: string[],
  toSegments: string[],
  moduleName: string,
): string {
  let common = 0;
  while (
    common < fromSegments.length &&
    common < toSegments.length &&
    fromSegments[common] === toSegments[common]
  ) {
    common++;
  }

  const up = fromSegments.length - common;
  const down = toSegments.slice(common);
  return `${".".repeat(up + 1)}${[...down, moduleName].join(".")}`;
}
