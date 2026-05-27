import type { Model, Program } from "@typespec/compiler";
import {
  camelToSnake,
  getColumnName,
  getIndexUsing,
  getPartialIndex,
  getPolymorphicConfig,
  isIndex,
  isKey,
  isUnique,
  type CompositeTypeField,
} from "@qninhdt/typespec-orm";
import { goStringLiteral } from "./EntConstants.js";
import { buildChain, type EntFileContext } from "./ent-context.js";

/**
 * Emits `index.Fields(...)` lines for properties marked indexed and for
 * composite type fields (which carry their own unique flag).
 */
export function buildEntIndexes(
  program: Program,
  model: Model,
  compositeTypeFields: CompositeTypeField[],
  indexedFields: Set<string>,
  ctx: EntFileContext,
): string[] {
  const indexes: string[] = [];
  for (const prop of model.properties.values()) {
    const columnName = getColumnName(program, prop);

    // Polymorphic discriminator: emit a compound (type, id) index when an
    // idColumn is configured. The idColumn is provided as a TypeSpec property
    // identifier (camelCase); snake_case it so it lines up with the actual
    // database column.
    const polymorphic = getPolymorphicConfig(program, prop);
    if (polymorphic?.idColumn) {
      const idColumnName = camelToSnake(polymorphic.idColumn);
      indexes.push(
        `index.Fields(${goStringLiteral(columnName)}, ${goStringLiteral(idColumnName)})`,
      );
    }

    if (!indexedFields.has(columnName)) continue;

    const method = getIndexUsing(program, prop);
    const predicate = getPartialIndex(program, prop);
    const annotationArgs: string[] = [];
    if (method && method !== "btree") {
      annotationArgs.push(`entsql.IndexType(${goStringLiteral(method.toUpperCase())})`);
    }
    if (predicate) {
      annotationArgs.push(`entsql.IndexWhere(${goStringLiteral(predicate)})`);
    }
    const chains: string[] = [];
    if (annotationArgs.length > 0) {
      ctx.usesEntSql = true;
      chains.push(`Annotations(${annotationArgs.join(", ")})`);
    }
    indexes.push(buildChain(`index.Fields(${goStringLiteral(columnName)})`, chains));
  }

  for (const composite of compositeTypeFields) {
    const fields = composite.columns.map((column) => goStringLiteral(column)).join(", ");
    const chains: string[] = [];
    if (composite.isUnique || composite.isPrimary) chains.push("Unique()");
    if (composite.where) {
      ctx.usesEntSql = true;
      chains.push(`Annotations(entsql.IndexWhere(${goStringLiteral(composite.where)}))`);
    }
    indexes.push(buildChain(`index.Fields(${fields})`, chains));
  }

  // Reference unused imports — kept for shared-helper future use.
  void isIndex;
  void isUnique;
  void isKey;

  return indexes;
}
