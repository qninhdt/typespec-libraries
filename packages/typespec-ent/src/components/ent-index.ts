import type { Model, Program } from "@typespec/compiler";
import {
  getColumnName,
  type CompositeTypeField,
} from "@qninhdt/typespec-orm";
import { goStringLiteral } from "./EntConstants.js";
import { buildChain } from "./ent-context.js";

/**
 * Emits `index.Fields(...)` lines for properties marked indexed and for
 * composite type fields (which carry their own unique flag).
 */
export function buildEntIndexes(
  program: Program,
  model: Model,
  compositeTypeFields: CompositeTypeField[],
  indexedFields: Set<string>,
): string[] {
  const indexes: string[] = [];
  for (const prop of model.properties.values()) {
    const columnName = getColumnName(program, prop);
    if (!indexedFields.has(columnName)) continue;
    indexes.push(`index.Fields(${goStringLiteral(columnName)})`);
  }

  for (const composite of compositeTypeFields) {
    const fields = composite.columns.map((column) => goStringLiteral(column)).join(", ");
    const chains = composite.isUnique || composite.isPrimary ? ["Unique()"] : [];
    indexes.push(buildChain(`index.Fields(${fields})`, chains));
  }

  return indexes;
}
