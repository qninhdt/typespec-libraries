import type { Model, Program } from "@typespec/compiler";
import {
  getColumnName,
  getIndexUsing,
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
    // idColumn is configured. The simple per-column index is also emitted
    // below if @index is applied.
    const polymorphic = getPolymorphicConfig(program, prop);
    if (polymorphic?.idColumn) {
      indexes.push(
        `index.Fields(${goStringLiteral(columnName)}, ${goStringLiteral(polymorphic.idColumn)})`,
      );
    }

    if (!indexedFields.has(columnName)) continue;

    const method = getIndexUsing(program, prop);
    const chains: string[] = [];
    if (method && method !== "btree") {
      // Ent does not natively expose a "USING <method>" knob, so surface it as
      // an entsql Annotation that downstream Atlas tooling can pick up.
      ctx.usesEntSql = true;
      chains.push(`Annotations(entsql.IndexType(${goStringLiteral(method.toUpperCase())}))`);
    }
    indexes.push(buildChain(`index.Fields(${goStringLiteral(columnName)})`, chains));
  }

  for (const composite of compositeTypeFields) {
    const fields = composite.columns.map((column) => goStringLiteral(column)).join(", ");
    const chains = composite.isUnique || composite.isPrimary ? ["Unique()"] : [];
    indexes.push(buildChain(`index.Fields(${fields})`, chains));
  }

  // Reference unused imports — kept for shared-helper future use.
  void isIndex;
  void isUnique;
  void isKey;

  return indexes;
}
