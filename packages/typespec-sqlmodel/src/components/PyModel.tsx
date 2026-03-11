/**
 * PyModel — JSX component for rendering a complete SQLModel Python file.
 *
 * Top-level orchestrator that wraps content in <SourceFile>.
 */

import { SourceFile } from "@alloy-js/core";
import type { Children } from "@alloy-js/core/jsx-runtime";
import type { Model, Program } from "@typespec/compiler";
import {
  getCompositeIndexes,
  getCompositeUniques,
  getDoc,
  classifyProperties,
  camelToSnake,
} from "@qninhdt/typespec-orm";
import {
  FILE_HEADER,
  FOUR_SPACES,
  generateEnumClass,
  buildPythonImportBlock,
} from "./PyConstants.js";
import { generateField, generateIgnoredField } from "./PyField.jsx";
import { generateAutoFkField, generateRelationField } from "./PyRelationField.jsx";

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
  const sqlmodelImports = new Set<string>(["SQLModel"]);
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
  for (const { prop, resolved } of relations) {
    needsRelationship.value = true;
    if (resolved.autoInjectFk) {
      fieldDefs.push(
        generateAutoFkField(
          program,
          prop,
          resolved,
          stdImports,
          saImports,
          sqlmodelImports,
          needsField,
          needsColumn,
        ),
      );
    }
    relationDefs.push(generateRelationField(program, prop, resolved));
  }

  // Regular DB-mapped fields
  for (const { prop } of regularProps) {
    fieldDefs.push(
      generateField(program, prop, stdImports, saImports, sqlmodelImports, needsField, needsColumn),
    );
  }

  // Finalize imports
  if (needsField.value) sqlmodelImports.add("Field");
  if (needsColumn.value) saImports.add("sqlalchemy.Column");
  if (needsRelationship.value) sqlmodelImports.add("Relationship");

  // Composite indexes & unique constraints
  const compIdxs = getCompositeIndexes(program, model);
  const compUnqs = getCompositeUniques(program, model);
  const hasTableArgs = compIdxs.length > 0 || compUnqs.length > 0;
  if (compIdxs.length > 0) saImports.add("sqlalchemy.Index");
  if (compUnqs.length > 0) saImports.add("sqlalchemy.UniqueConstraint");

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
    for (const idx of compIdxs) {
      const cols = idx.columns.map((c) => `"${c}"`).join(", ");
      tableArgEntries.push(`${FOUR_SPACES}${FOUR_SPACES}Index("${idx.name}", ${cols})`);
    }
    for (const unq of compUnqs) {
      const cols = unq.columns.map((c) => `"${c}"`).join(", ");
      tableArgEntries.push(
        `${FOUR_SPACES}${FOUR_SPACES}UniqueConstraint(${cols}, name="${unq.name}")`,
      );
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
