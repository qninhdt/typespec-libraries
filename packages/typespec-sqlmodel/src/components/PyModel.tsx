/**
 * PyModel -JSX component for rendering a complete SQLModel Python file.
 *
 * Top-level orchestrator that wraps content in <SourceFile>.
 */

import { SourceFile } from "@alloy-js/core";
import type { Children } from "@alloy-js/core/jsx-runtime";
import {
  walkPropertiesInherited,
  type Model,
  type ModelProperty,
  type Program,
  type Scalar,
} from "@typespec/compiler";
import {
  getColumnName,
  getCheck,
  getCompositeFields,
  getDoc,
  classifyProperties,
  collectCompositeTypeFields,
  buildCompositeUniqueColumns,
  camelToSnake,
  getColumnName as getOrmColumnName,
  getSchemaName,
  findVersionProperty,
  type NormalizedOrmModel,
} from "@qninhdt/typespec-orm";
import {
  FILE_HEADER,
  FOUR_SPACES,
  generateEnumClass,
  buildPythonImportBlock,
  pythonStringLiteral,
  pythonTripleQuotedString,
  toPythonRelativeImport,
} from "./PyConstants.js";
import { generateField, generateIgnoredField } from "./PyField.jsx";
import type { ResolvedForeignKeyFieldInfo } from "./PyField.jsx";
import { generateRelationField, type MappedByIndex } from "./PyRelationField.jsx";
import { collectAliasableCustomScalars } from "./py-field-utils.js";
import { PyModelBuilder } from "./py-model-builder.js";
import type { SqlModelEmitterOptions } from "../lib.js";

export interface PyModelFileProps {
  readonly program: Program;
  readonly normalizedModel: NormalizedOrmModel;
  readonly modelLookup: Map<Model, NormalizedOrmModel>;
  readonly collectionStrategy?: SqlModelEmitterOptions["collection-strategy"];
  readonly manyToManySecondaryByProp?: Map<ModelProperty, string>;
  readonly runtimeImports?: Map<string, Set<string>>;
  readonly scalarAliasNames?: ReadonlyMap<Scalar, string>;
  readonly mappedByIndex?: MappedByIndex;
}

interface RegularFieldContext {
  program: Program;
  regularProps: ReturnType<typeof classifyProperties>["fields"];
  compositeUniqueColumns: Set<string>;
  fkInfoMap: Map<string, ResolvedForeignKeyFieldInfo>;
  builder: PyModelBuilder;
  collectionStrategy?: SqlModelEmitterOptions["collection-strategy"];
  scalarAliasNames?: ReadonlyMap<Scalar, string>;
}

interface PyModelRenderContext {
  program: Program;
  model: Model;
  tableName?: string;
  enumTypes: ReturnType<typeof classifyProperties>["enumTypes"];
  stdImports: Set<string>;
  saImports: Set<string>;
  sqlmodelImports: Set<string>;
  runtimeImports?: Map<string, Set<string>>;
  relationTargetModels: Set<Model>;
  sourceModels: Model[];
  modelLookup: Map<Model, NormalizedOrmModel>;
  namespacePath: string[];
  sourceModelNames: string[];
  tableArgEntries: string[];
  fieldDefs: string[];
  relationDefs: string[];
  scalarNames?: string[];
  versionColumnName?: string;
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
    scalarAliasNames,
    mappedByIndex,
  } = props;
  const { model } = normalizedModel;
  const tableName = normalizedModel.tableName;
  const fileName = camelToSnake(model.name) + ".py";
  const sourceModels = normalizedModel.mixins;

  const builder = new PyModelBuilder();

  // Classify properties
  const {
    enumTypes,
    ignored,
    relations,
    fields: regularProps,
  } = classifyProperties(program, model, { ownPropertiesOnly: true });
  const compositeTypeFields =
    normalizedModel.kind === "table" && tableName
      ? collectCompositeTypeFields(program, model, tableName)
      : [];
  const compositeUniqueColumns = buildCompositeUniqueColumns(compositeTypeFields);
  const fkInfoMap = buildForeignKeyInfoMap(model, relations);

  const tableArgEntries = buildTableArgEntries(
    program,
    model,
    compositeTypeFields,
    builder.saImports,
  );

  const allCustomScalars = collectAliasableCustomScalars(program, model);

  addIgnoredFields(program, ignored, builder);
  addRelationFields(program, relations, builder, manyToManySecondaryByProp, mappedByIndex);
  addRegularFields({
    program,
    regularProps,
    compositeUniqueColumns,
    fkInfoMap,
    builder,
    collectionStrategy,
    scalarAliasNames,
  });
  addEnumImports(enumTypes, builder.stdImports, builder.saImports);

  const code = buildPyModelCode({
    program,
    model,
    tableName,
    enumTypes,
    stdImports: builder.stdImports,
    saImports: builder.saImports,
    sqlmodelImports: builder.sqlmodelImports,
    runtimeImports,
    relationTargetModels: builder.relationTargetModels,
    sourceModels,
    modelLookup,
    namespacePath: normalizedModel.namespacePath,
    sourceModelNames: sourceModels.map((item) => item.name).sort((a, b) => a.localeCompare(b)),
    tableArgEntries,
    fieldDefs: builder.fieldDefs,
    relationDefs: builder.relationDefs,
    scalarNames: Array.from(allCustomScalars).map((s) => scalarAliasNames?.get(s) ?? s.name),
    versionColumnName: tableName
      ? (() => {
          const v = findVersionProperty(program, model);
          return v ? getOrmColumnName(program, v) : undefined;
        })()
      : undefined,
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
    builder,
    collectionStrategy,
    scalarAliasNames,
  } = context;
  for (const { prop } of regularProps) {
    if (getCompositeFields(program, prop)) continue;

    const columnName = getColumnName(program, prop);
    builder.addFieldDef(
      generateField(
        program,
        prop,
        builder.stdImports,
        builder.saImports,
        builder.sqlmodelImports,
        builder.needsField,
        builder.needsColumn,
        compositeUniqueColumns.has(columnName),
        fkInfoMap.get(columnName),
        collectionStrategy,
        scalarAliasNames,
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
  const schemaName = getSchemaName(program, model);
  if (schemaName) {
    tableArgEntries.push(
      `${FOUR_SPACES}${FOUR_SPACES}{"schema": ${pythonStringLiteral(schemaName)}}`,
    );
  }
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
    const cols = ct.columns.map((column) => pythonStringLiteral(column)).join(", ");
    if (ct.isPrimary || ct.isUnique) {
      hasUniqueConstraint = true;
      tableArgEntries.push(
        `${FOUR_SPACES}${FOUR_SPACES}UniqueConstraint(${cols}, name=${pythonStringLiteral(ct.name)})`,
      );
      continue;
    }

    hasIndex = true;
    tableArgEntries.push(
      `${FOUR_SPACES}${FOUR_SPACES}Index(${pythonStringLiteral(ct.name)}, ${cols})`,
    );
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
  for (const prop of walkPropertiesInherited(model)) {
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
    sourceModels,
    modelLookup,
    namespacePath,
    sourceModelNames,
    tableArgEntries,
    fieldDefs,
    relationDefs,
    scalarNames,
    versionColumnName,
  } = context;
  let code = FILE_HEADER;
  // `from __future__ import annotations` makes ALL annotations lazy strings,
  // letting forward references (e.g. inverse relationship class names) resolve
  // without TYPE_CHECKING gymnastics. MUST be the first import statement.
  code += "from __future__ import annotations\n\n";
  code += buildPythonImportBlock(stdImports, saImports, sqlmodelImports, "sqlmodel");
  code += buildRuntimeImportBlock(runtimeImports);
  code += buildSourceModelImportBlock(sourceModels, modelLookup, namespacePath);
  code += buildTypeCheckingBlock(relationTargetModels, modelLookup, namespacePath);
  if (scalarNames && scalarNames.length > 0) {
    // `_scalars.py` lives at the top-level package root. Walk up
    // `namespacePath.length` levels; clamp to 1 so a root-namespace model
    // (length 0) still emits `from ._scalars import ...` rather than the
    // Python-invalid `from _scalars import ...`.
    const dots = ".".repeat(Math.max(namespacePath.length, 1));
    code += `from ${dots}_scalars import ${dedupeImportNames(scalarNames).join(", ")}\n`;
  }
  code += "\n\n";
  code += buildEnumClasses(enumTypes);
  code += buildModelClass(
    program,
    model,
    tableName,
    sourceModelNames,
    tableArgEntries,
    fieldDefs,
    relationDefs,
    versionColumnName,
    stdImports,
  );
  return code;
}

function dedupeImportNames(names: readonly string[]): string[] {
  return [...new Set(names)].sort((left, right) => left.localeCompare(right));
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
  tableName: string | undefined,
  sourceModelNames: string[],
  tableArgEntries: string[],
  fieldDefs: string[],
  relationDefs: string[],
  versionColumnName: string | undefined,
  stdImports: Set<string>,
): string {
  const baseList = sourceModelNames.length > 0 ? sourceModelNames.join(", ") : "SQLModel";
  const isTable = !!tableName;
  const modelDoc =
    getDoc(program, model) ?? (isTable ? `Represents the ${tableName} table.` : model.name);
  let code = `class ${model.name}(${baseList}${isTable ? ", table=True" : ""}):\n`;
  code += `${FOUR_SPACES}${pythonTripleQuotedString(modelDoc)}\n\n`;

  if (tableName) {
    // ClassVar tells SQLModel/SQLAlchemy this is a class attribute, not a column.
    // Without it, the metaclass would try to treat `__tablename__` as a field.
    stdImports.add("typing.ClassVar");
    code += `${FOUR_SPACES}__tablename__: ClassVar[str] = ${pythonStringLiteral(tableName)}\n`;
  }

  if (tableArgEntries.length > 0) {
    code += `${FOUR_SPACES}__table_args__ = (\n`;
    code += tableArgEntries.join(",\n") + ",\n";
    code += `${FOUR_SPACES})\n`;
  }

  if (versionColumnName) {
    code += `${FOUR_SPACES}__mapper_args__ = {"version_id_col": ${pythonStringLiteral(versionColumnName)}}\n`;
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
  builder: PyModelBuilder,
): void {
  for (const { prop, enumInfo } of ignored) {
    builder.addFieldDef(generateIgnoredField(program, prop, builder.stdImports, enumInfo));
  }
}

function addRelationFields(
  program: Program,
  relations: ReturnType<typeof classifyProperties>["relations"],
  builder: PyModelBuilder,
  manyToManySecondaryByProp: Map<ModelProperty, string> | undefined,
  mappedByIndex: MappedByIndex | undefined,
): void {
  for (const { prop, resolved } of relations) {
    builder.ensureSqlmodel("Relationship");
    const secondary =
      resolved.kind === "many-to-many" ? manyToManySecondaryByProp?.get(prop) : undefined;
    const { field, targetModel } = generateRelationField(
      program,
      prop,
      resolved,
      secondary,
      mappedByIndex,
    );
    builder.addRelationDef(field, targetModel);
    builder.ensureStdImport("typing.TYPE_CHECKING");
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

    fkInfoMap.set(resolved.fkColumnName, {
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

function buildSourceModelImportBlock(
  sourceModels: Model[],
  modelLookup: Map<Model, NormalizedOrmModel>,
  namespacePath: string[],
): string {
  if (sourceModels.length === 0) {
    return "";
  }

  let code = "";
  for (const sourceModel of sourceModels) {
    const sourceInfo = modelLookup.get(sourceModel);
    if (!sourceInfo) continue;
    code += `from ${toPythonRelativeImport(namespacePath, sourceInfo.namespacePath, camelToSnake(sourceModel.name))} import ${sourceModel.name}\n`;
  }
  return code ? `${code}\n` : "";
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
