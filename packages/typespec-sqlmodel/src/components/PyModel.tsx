/**
 * PyModel -JSX component for rendering a complete SQLModel Python file.
 *
 * Top-level orchestrator that wraps content in <SourceFile>.
 */

import { SourceFile } from "@alloy-js/core";
import type { Children } from "@alloy-js/core/jsx-runtime";
import type { Model, Program } from "@typespec/compiler";
import {
  getColumnName,
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
import { generateRelationField } from "./PyRelationField.jsx";

export interface PyModelFileProps {
  readonly program: Program;
  readonly normalizedModel: NormalizedOrmModel;
  readonly modelLookup: Map<Model, NormalizedOrmModel>;
}

/**
 * JSX component: renders a complete Python source file for a SQLModel class.
 */
export function PyModelFile(props: PyModelFileProps): Children {
  const { program, normalizedModel, modelLookup } = props;
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

  const fieldDefs: string[] = [];
  const relationDefs: string[] = [];
  const relationTargetModels = new Set<Model>();

  // Ignored fields → ClassVar
  for (const { prop, enumInfo } of ignored) {
    fieldDefs.push(generateIgnoredField(program, prop, stdImports, enumInfo));
  }

  // Relation navigation properties
  for (const { prop, resolved } of relations) {
    if (!sqlmodelImports.has("Relationship")) {
      sqlmodelImports.add("Relationship");
    }
    const { field, targetModel } = generateRelationField(program, prop, resolved);
    relationDefs.push(field);
    // Add to TYPE_CHECKING imports for cross-model relations (including self-referential)
    relationTargetModels.add(targetModel);
    stdImports.add("TYPE_CHECKING");
  }

  // Collect composite type fields using shared helper
  const compositeTypeFields = collectCompositeTypeFields(program, model, tableName);
  const compositeUniqueColumns = buildCompositeUniqueColumns(compositeTypeFields);

  // Build a map of FK column name -> targetTable for use in field generation
  const fkInfoMap = new Map<string, string>();
  for (const { resolved } of relations) {
    const dbColumnName = camelToSnake(resolved.fkColumnName);
    fkInfoMap.set(dbColumnName, resolved.targetTable);
  }

  // Regular DB-mapped fields
  for (const { prop } of regularProps) {
    // Skip composite type fields - they are configuration only
    if (getCompositeFields(program, prop)) continue;
    const columnName = getColumnName(program, prop);
    const isPartOfCompositeUnique = compositeUniqueColumns.has(columnName);
    const targetTable = fkInfoMap.get(columnName);
    fieldDefs.push(
      generateField(
        program,
        prop,
        stdImports,
        saImports,
        sqlmodelImports,
        needsField,
        needsColumn,
        isPartOfCompositeUnique,
        targetTable,
      ),
    );
  }

  // Composite indexes & unique constraints
  const hasTableArgs = compositeTypeFields.length > 0;
  let hasIndex = false;
  let hasUniqueConstraint = false;
  if (compositeTypeFields.length > 0) {
    for (const ct of compositeTypeFields) {
      if (ct.isPrimary || ct.isUnique) {
        hasUniqueConstraint = true;
      } else {
        hasIndex = true;
      }
    }
    if (hasIndex) saImports.add("sqlalchemy.Index");
    if (hasUniqueConstraint) saImports.add("sqlalchemy.UniqueConstraint");
  }

  // Enum imports
  if (enumTypes.size > 0) {
    stdImports.add("enum.Enum");
    saImports.add("sqlalchemy.Enum as SAEnum");
  }

  // Build file content
  let code = FILE_HEADER;
  code += buildPythonImportBlock(stdImports, saImports, sqlmodelImports, "sqlmodel");

  // TYPE_CHECKING block for relation imports (avoids circular dependency)
  if (relationTargetModels.size > 0) {
    code += "\nif TYPE_CHECKING:\n";
    for (const targetModel of [...relationTargetModels].sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const targetInfo = modelLookup.get(targetModel);
      if (!targetInfo) continue;
      code += `    from ${toPythonRelativeImport(normalizedModel.namespacePath, targetInfo.namespacePath, camelToSnake(targetModel.name))} import ${targetModel.name}\n`;
    }
  }

  code += "\n\n";

  // Enum classes
  for (const [enumName, members] of enumTypes) {
    code += generateEnumClass(enumName, members);
    code += "\n\n";
  }

  // Class definition
  const modelDoc = getDoc(program, model);
  code += `class ${model.name}(SQLModel, table=True):\n`;
  code += `${FOUR_SPACES}"""${modelDoc ?? `Represents the ${tableName} table.`}"""\n\n`;
  code += `${FOUR_SPACES}__tablename__ = "${tableName}" # type: ignore \n`;

  // Table args
  if (hasTableArgs) {
    const tableArgEntries: string[] = [];
    for (const ct of compositeTypeFields) {
      // Convert camelCase column names to snake_case for SQL
      const cols = ct.columns.map((c) => `"${camelToSnake(c)}"`).join(", ");
      if (ct.isPrimary || ct.isUnique) {
        tableArgEntries.push(
          `${FOUR_SPACES}${FOUR_SPACES}UniqueConstraint(${cols}, name="${camelToSnake(ct.name)}")`,
        );
      } else {
        tableArgEntries.push(
          `${FOUR_SPACES}${FOUR_SPACES}Index("${camelToSnake(ct.name)}", ${cols})`,
        );
      }
    }
    code += `${FOUR_SPACES}__table_args__ = (\n`;
    code += tableArgEntries.join(",\n") + ",\n";
    code += `${FOUR_SPACES})\n`;
  }

  code += "\n";

  for (const field of fieldDefs) {
    code += field;
  }

  if (relationDefs.length > 0) {
    code += `\n${FOUR_SPACES}# ─── Relationships ─────────────────────\n`;
    for (const rd of relationDefs) {
      code += rd;
    }
  }

  return (
    <SourceFile path={fileName} filetype="py" printWidth={9999}>
      {code}
    </SourceFile>
  );
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
