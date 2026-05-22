/**
 * DbmlRelationField - DBML reference generation.
 */

import type { Model, ModelProperty, Program } from "@typespec/compiler";
import type { ResolvedRelation } from "@qninhdt/typespec-orm";
import { qualifyDbmlTable, quoteDbmlIdentifier } from "./DbmlConstants.js";

export function generateRelationField(
  program: Program,
  _prop: ModelProperty,
  rel: ResolvedRelation,
  sourceModel: Model,
): string {
  // Use the already-resolved database column names.
  const fromColumn = quoteDbmlIdentifier(rel.fkColumnName);
  const toColumn = quoteDbmlIdentifier(rel.fkTargetColumn || "id");

  // Schema-qualify both endpoints so split-by-namespace docs render
  // cross-schema FKs as `schema.table.column`.
  const fromTable = qualifyDbmlTable(program, sourceModel);
  const toTable = qualifyDbmlTable(program, rel.targetModel);

  // Determine relationship type based on relation kind
  // DBML uses: > (many-to-one), < (one-to-many), - (one-to-one)
  let symbol = ">";
  if (rel.kind === "one-to-many") {
    // For one-to-many, the FK is on the other table, so we swap
    symbol = "<";
  } else if (rel.kind === "one-to-one") {
    symbol = "-";
  }

  // Generate reference line: Ref: source.fk_column > target.pk_column
  // For many-to-one: Ref: posts.author_id > users.id
  // DBML spec examples use lowercase action tokens (`cascade`, `set null`,
  // `restrict`, `no action`); `@onDelete("CASCADE")` carries the SQL form so
  // we lowercase before rendering.
  const actionParts: string[] = [];
  if (rel.onDelete) actionParts.push(`delete: ${rel.onDelete.toLowerCase()}`);
  if (rel.onUpdate) actionParts.push(`update: ${rel.onUpdate.toLowerCase()}`);
  const actionSuffix = actionParts.length > 0 ? ` [${actionParts.join(", ")}]` : "";

  return `Ref: ${fromTable}.${fromColumn} ${symbol} ${toTable}.${toColumn}${actionSuffix}`;
}

/**
 * Generate all reference lines for a table's relations.
 */
export function generateRelationFields(
  program: Program,
  relations: { prop: ModelProperty; resolved: ResolvedRelation }[],
  sourceModel: Model,
): string[] {
  const refs: string[] = [];

  for (const { prop, resolved } of relations) {
    const ref = generateRelationField(program, prop, resolved, sourceModel);
    void prop;
    if (ref) {
      refs.push(ref);
    }
  }

  return refs;
}
