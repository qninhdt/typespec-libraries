/**
 * PyRelationField -Functions for SQLModel relation field generation.
 *
 * Returns plain strings. Called imperatively by PyModel.
 */

import type { Model, ModelProperty, Program } from "@typespec/compiler";
import type { ResolvedRelation } from "@qninhdt/typespec-orm";
import { camelToSnake, getDoc, isUnique } from "@qninhdt/typespec-orm";
import { reportDiagnostic } from "../lib.js";
import {
  FOUR_SPACES,
  NEEDS_SA_COLUMN,
  getPythonTypeMap,
  promoteFieldArgsToColumn,
  serializeColumnKwargs,
} from "./PyConstants.js";

/**
 * Generate a SQLModel Field() for an auto-injected foreign key column.
 */
export function generateAutoFkField(
  program: Program,
  relationProp: ModelProperty,
  rel: ResolvedRelation,
  stdImports: Set<string>,
  saImports: Set<string>,
  sqlmodelImports: Set<string>,
  needsField: { value: boolean },
  needsColumn: { value: boolean },
): string {
  const pyFieldName = rel.fkColumnName;
  const isOptional = relationProp.optional;

  const mapping = rel.fkDbType ? getPythonTypeMap(rel.fkDbType) : getPythonTypeMap("uuid");
  for (const imp of mapping.imports) stdImports.add(imp);
  for (const imp of mapping.saImports) saImports.add(imp);

  let pyType = mapping.pyType;
  if (isOptional) pyType = `${pyType} | None`;

  needsField.value = true;
  const fieldArgs: string[] = [];
  const columnArgs: string[] = [];

  if (isOptional) fieldArgs.push("default=None");
  if (!isOptional) columnArgs.push("nullable=False");

  if (isUnique(program, relationProp)) {
    fieldArgs.push("unique=True");
  } else {
    fieldArgs.push("index=True");
  }

  const fkRef = `${rel.targetTable}.${rel.fkTargetColumn}`;

  if (rel.onDelete || rel.onUpdate) {
    needsColumn.value = true;
    saImports.add("sqlalchemy.ForeignKey");
    const fkArgs: string[] = [`"${fkRef}"`];
    if (rel.onDelete) fkArgs.push(`ondelete="${rel.onDelete}"`);
    if (rel.onUpdate) fkArgs.push(`onupdate="${rel.onUpdate}"`);
    columnArgs.unshift(`ForeignKey(${fkArgs.join(", ")})`);
  } else {
    fieldArgs.push(`foreign_key="${fkRef}"`);
  }

  const doc = getDoc(program, relationProp);
  if (doc) {
    needsColumn.value = true;
    columnArgs.push(`comment="${doc.replace(/"/g, '\\"')}"`);
  }

  const docComment = doc ? `${FOUR_SPACES}# ${doc}\n` : "";

  const needsExplicitColumn =
    (rel.fkDbType && NEEDS_SA_COLUMN.has(rel.fkDbType) && mapping.saColumnType) ||
    columnArgs.some((a) => a.startsWith("ForeignKey("));

  if (needsExplicitColumn) {
    needsColumn.value = true;
    saImports.add("sqlalchemy.Column");
    const filteredFieldArgs = promoteFieldArgsToColumn(fieldArgs, columnArgs, saImports);
    const saType = mapping.saColumnType;
    const allColumnArgs = saType ? [saType, ...columnArgs].join(", ") : columnArgs.join(", ");
    filteredFieldArgs.push(`sa_column=Column(${allColumnArgs})`);
    return `${docComment}${FOUR_SPACES}${pyFieldName}: ${pyType} = Field(${filteredFieldArgs.join(", ")})\n`;
  }

  if (columnArgs.length > 0) {
    fieldArgs.push(`sa_column_kwargs=${serializeColumnKwargs(columnArgs)}`);
  }

  return `${docComment}${FOUR_SPACES}${pyFieldName}: ${pyType} = Field(${fieldArgs.join(", ")})\n`;
}

/**
 * Generate a SQLModel Relationship() for a navigation property.
 */
export function generateRelationField(
  program: Program,
  prop: ModelProperty,
  rel: ResolvedRelation,
): string {
  const pyFieldName = camelToSnake(prop.name);
  const pyRefType = `"${rel.targetModel.name}"`;

  const isMany = rel.kind === "one-to-many" || rel.kind === "many-to-many";
  const pyType = isMany ? `list[${pyRefType}]` : `${pyRefType} | None`;

  const relArgs: string[] = [];

  if (rel.backPopulates) {
    relArgs.push(`back_populates="${rel.backPopulates}"`);
  }

  if (rel.kind === "one-to-many" && !rel.backPopulates) {
    reportDiagnostic(program, {
      code: "missing-back-reference",
      format: {
        propName: prop.name,
        modelName: (prop.model as Model)?.name ?? "<unknown>",
        targetModel: rel.targetModel.name,
      },
      target: prop,
    });
  }

  const isSelfRef =
    (rel.kind === "many-to-one" || rel.kind === "one-to-one") && prop.model === rel.targetModel;
  if (isSelfRef) {
    relArgs.push(
      `sa_relationship_kwargs={"foreign_keys": "[${rel.targetModel.name}.${rel.fkColumnName}]"}`,
    );
  }

  if (isMany && rel.onDelete === "CASCADE") {
    relArgs.push('cascade="all, delete-orphan"');
  } else if (isMany && rel.onDelete === "SET NULL") {
    relArgs.push('cascade="save-update, merge"');
  }

  const doc = getDoc(program, prop);
  const docComment = doc ? `${FOUR_SPACES}# ${doc}\n` : "";
  return `${docComment}${FOUR_SPACES}${pyFieldName}: ${pyType} = Relationship(${relArgs.join(", ")})\n`;
}
