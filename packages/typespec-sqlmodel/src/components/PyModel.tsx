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
  isKey,
  isUnique,
  camelToSnake,
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
  readonly model: Model;
  readonly tableName: string;
}

/**
 * JSX component: renders a complete Python source file for a SQLModel class.
 */
export function PyModelFile(props: PyModelFileProps): Children {
  const { program, model, tableName } = props;
  const fileName = camelToSnake(model.name) + ".py";

  const stdImports = new Set<string>();
  const saImports = new Set<string>();
  const sqlmodelImports = new Set<string>(["SQLModel", "Field", "Relationship"]);
  const needsField = { value: false };
  const needsColumn = { value: false };
  const needsRelationship = { value: false };

  // Classify properties
  const {
    enumTypes,
    ignored,
    relations,
    fields: regularProps,
  } = classifyProperties(program, model);

  const fieldDefs: string[] = [];
  const relationDefs: string[] = [];

  // Ignored fields → ClassVar
  for (const { prop, enumInfo } of ignored) {
    fieldDefs.push(generateIgnoredField(program, prop, stdImports, enumInfo));
  }

  // Relation navigation properties
  // Generate relation fields only - NO auto FK generation (everything must be explicit)
  for (const { prop, resolved } of relations) {
    needsRelationship.value = true;
    relationDefs.push(generateRelationField(program, prop, resolved));
  }

  // Collect composite type fields from properties (composite<col1, col2>)
  // This needs to be done BEFORE generating regular fields so we can skip unique=True for composite fields
  const compositeTypeFields: {
    name: string;
    columns: string[];
    isUnique: boolean;
    isPrimary: boolean;
  }[] = [];
  for (const [, prop] of model.properties) {
    const columns = getCompositeFields(program, prop);
    if (columns) {
      // Generate name: [tableName]_[col1]_[col2]_..._[idx|unique]
      // Use snake_case for column names in the generated name
      const suffix = isKey(program, prop) ? "pk" : isUnique(program, prop) ? "unique" : "idx";
      const snakeColumns = columns.map((c) => camelToSnake(c));
      const generatedName = [tableName, ...snakeColumns, suffix].join("_");
      compositeTypeFields.push({
        name: generatedName,
        columns,
        isUnique: isUnique(program, prop),
        isPrimary: isKey(program, prop),
      });
    }
  }

  // Build a map of column names that are part of composite unique
  const compositeUniqueColumns = new Set<string>();
  for (const ct of compositeTypeFields) {
    if (ct.isUnique) {
      for (const col of ct.columns) {
        compositeUniqueColumns.add(camelToSnake(col));
      }
    }
  }

  // Build a map of FK column name -> targetTable for use in field generation
  // Note: fkColumnName from relation is the TypeSpec property name, need to convert to DB column name
  const fkInfoMap = new Map<string, string>();
  for (const { resolved } of relations) {
    // Convert the FK column name to snake_case (database column name)
    const dbColumnName = camelToSnake(resolved.fkColumnName);
    fkInfoMap.set(dbColumnName, resolved.targetTable);
  }

  // Regular DB-mapped fields
  for (const { prop } of regularProps) {
    // Skip composite type fields - they are configuration only
    if (getCompositeFields(program, prop)) continue;
    // Skip unique=True for fields that are part of composite unique
    const columnName = getColumnName(program, prop);
    const isPartOfCompositeUnique = compositeUniqueColumns.has(columnName);
    // Check if this field is a FK (used by any relation) - get target table name
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
  code += `${FOUR_SPACES}__tablename__ = "${tableName}"\n`;

  // Table args
  if (hasTableArgs) {
    const tableArgEntries: string[] = [];
    for (const ct of compositeTypeFields) {
      // Convert camelCase column names to snake_case for SQL
      const cols = ct.columns.map((c) => `"${camelToSnake(c)}"`).join(", ");
      if (ct.isPrimary || ct.isUnique) {
        // Primary or unique constraint
        tableArgEntries.push(
          `${FOUR_SPACES}${FOUR_SPACES}UniqueConstraint(${cols}, name="${camelToSnake(ct.name)}")`,
        );
      } else {
        // Regular index
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
