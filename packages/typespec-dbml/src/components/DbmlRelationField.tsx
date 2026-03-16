/**
 * DbmlRelationField - Generate DBML reference definitions.
 */

import type { ModelProperty, Program } from "@typespec/compiler";
import type { ResolvedRelation } from "@qninhdt/typespec-orm";
import { camelToSnake } from "@qninhdt/typespec-orm";

/**
 * Generate a DBML reference line.
 */
export function generateRelationField(
  program: Program,
  prop: ModelProperty,
  rel: ResolvedRelation,
  sourceTableName: string,
): string {
  // Get the FK column and convert to snake_case
  const fromColumn = camelToSnake(rel.fkColumnName);
  const toTable = rel.targetTable;
  const toColumn = camelToSnake(rel.fkTargetColumn || "id");

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
  return `Ref: ${sourceTableName}.${fromColumn} ${symbol} ${toTable}.${toColumn}`;
}

/**
 * Generate all reference lines for a table's relations.
 */
export function generateRelationFields(
  program: Program,
  relations: { prop: ModelProperty; resolved: ResolvedRelation }[],
  sourceTableName: string,
): string[] {
  const refs: string[] = [];

  for (const { prop, resolved } of relations) {
    const ref = generateRelationField(program, prop, resolved, sourceTableName);
    if (ref) {
      refs.push(ref);
    }
  }

  return refs;
}
