/**
 * DbmlAssociation - DBML rendering for many-to-many association join tables.
 */

import type { Program } from "@typespec/compiler";
import { getColumnName, getSchemaName, type ManyToManyAssociation } from "@qninhdt/typespec-orm";
import { getDbmlType, qualifyDbmlTable, quoteDbmlIdentifier } from "./DbmlConstants.js";
import { reportDiagnostic } from "../lib.js";

/**
 * Render the join-table definition for a many-to-many association.
 */
export function renderAssociationTable(
  program: Program,
  association: ManyToManyAssociation,
): string | undefined {
  const leftType = getDbmlType(program, association.leftKey.type);
  const rightType = getDbmlType(program, association.rightKey.type);
  if (leftType === undefined || rightType === undefined) {
    // Strict-by-default: a many-to-many endpoint with an unmappable key column
    // type produces a fallback that misrepresents the schema. Diagnose and
    // skip the join table so the rest of the document remains parseable.
    reportDiagnostic(program, {
      code: "association-column-type-fallback",
      target: leftType === undefined ? association.leftKey : association.rightKey,
      format: { table: association.tableName },
    });
    return undefined;
  }
  const leftCol = quoteDbmlIdentifier(association.leftJoinColumn);
  const rightCol = quoteDbmlIdentifier(association.rightJoinColumn);

  // Schema-qualify + quote the heading using the same helper used for the
  // Refs below; otherwise the join table's `Table` line and the `Ref:` lines
  // disagree when both endpoints share an `@schema`.
  const joinSchema =
    getSchemaName(program, association.leftModel) ?? getSchemaName(program, association.rightModel);
  const joinTable = quoteDbmlIdentifier(association.tableName);
  const joinQualified = joinSchema ? `${quoteDbmlIdentifier(joinSchema)}.${joinTable}` : joinTable;

  // Mark each join column with `pk` in addition to the composite-PK index entry.
  // The indexes-block form alone is missed by tooling that walks
  // `Table.fields[].pk`; the per-column form alone misses dbdocs' composite-PK
  // visualization. Emit both — `@dbml/core` accepts the redundancy.
  return [
    `Table ${joinQualified} {`,
    `  ${leftCol} ${leftType} [pk, not null]`,
    `  ${rightCol} ${rightType} [pk, not null]`,
    "",
    "  indexes {",
    `    (${leftCol}, ${rightCol}) [pk]`,
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
    getSchemaName(program, association.leftModel) ?? getSchemaName(program, association.rightModel);
  const joinTable = quoteDbmlIdentifier(association.tableName);
  const joinQualified = joinSchema ? `${quoteDbmlIdentifier(joinSchema)}.${joinTable}` : joinTable;
  const leftJoinCol = quoteDbmlIdentifier(association.leftJoinColumn);
  const rightJoinCol = quoteDbmlIdentifier(association.rightJoinColumn);
  const leftKeyCol = quoteDbmlIdentifier(getColumnName(program, association.leftKey));
  const rightKeyCol = quoteDbmlIdentifier(getColumnName(program, association.rightKey));
  return [
    `Ref: ${joinQualified}.${leftJoinCol} > ${leftQualified}.${leftKeyCol}`,
    `Ref: ${joinQualified}.${rightJoinCol} > ${rightQualified}.${rightKeyCol}`,
  ];
}
