/**
 * DbmlAssociation - DBML rendering for many-to-many association join tables.
 */

import type { Model, Program } from "@typespec/compiler";
import {
  getColumnName,
  getSchemaName,
  getTableName,
  type ManyToManyAssociation,
} from "@qninhdt/typespec-orm";
import { getDbmlType } from "./DbmlConstants.js";

function qualifyDbmlTable(program: Program, model: Model): string {
  const schema = getSchemaName(program, model);
  const table = getTableName(program, model);
  return schema ? `${schema}.${table}` : table;
}

/**
 * Render the join-table definition for a many-to-many association.
 */
export function renderAssociationTable(
  program: Program,
  association: ManyToManyAssociation,
): string {
  const leftType = getDbmlType(program, association.leftKey.type) ?? "varchar(255)";
  const rightType = getDbmlType(program, association.rightKey.type) ?? "varchar(255)";

  return [
    `Table ${association.tableName} {`,
    `  ${association.leftJoinColumn} ${leftType} [not null]`,
    `  ${association.rightJoinColumn} ${rightType} [not null]`,
    "",
    "  indexes {",
    `    (${association.leftJoinColumn}, ${association.rightJoinColumn}) [pk]`,
    "  }",
    "}",
  ].join("\n");
}

/**
 * Render the foreign-key Ref lines connecting the join table to its endpoints.
 */
export function renderAssociationRefs(
  program: Program,
  association: ManyToManyAssociation,
): string[] {
  const leftQualified = qualifyDbmlTable(program, association.leftModel);
  const rightQualified = qualifyDbmlTable(program, association.rightModel);
  const joinSchema =
    getSchemaName(program, association.leftModel) ??
    getSchemaName(program, association.rightModel);
  const joinQualified = joinSchema
    ? `${joinSchema}.${association.tableName}`
    : association.tableName;
  return [
    `Ref: ${joinQualified}.${association.leftJoinColumn} > ${leftQualified}.${getColumnName(program, association.leftKey)}`,
    `Ref: ${joinQualified}.${association.rightJoinColumn} > ${rightQualified}.${getColumnName(program, association.rightKey)}`,
  ];
}
