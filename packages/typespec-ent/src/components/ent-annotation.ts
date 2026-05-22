import type { Model, Program } from "@typespec/compiler";
import {
  getCheck,
  getSchemaName,
  getTableName,
  type NormalizedOrmModel,
} from "@qninhdt/typespec-orm";
import { goStringLiteral } from "./EntConstants.js";
import type { EntFileContext } from "./ent-context.js";

/**
 * Builds the body of the `Annotations()` method for a table-kind schema.
 * Returns an empty list for non-table kinds (mixins). Mutates `ctx` to
 * record that entsql/entschema imports are required when annotations exist.
 */
export function buildEntAnnotations(
  program: Program,
  model: Model,
  normalizedModel: NormalizedOrmModel,
  ctx: EntFileContext,
): string[] {
  if (normalizedModel.kind !== "table") {
    return [];
  }

  const checks: string[] = [];
  for (const prop of model.properties.values()) {
    const check = getCheck(program, prop);
    if (!check) continue;
    checks.push(`${goStringLiteral(check.name)}: ${goStringLiteral(check.expression)}`);
  }

  const annotationParts = [`Table: ${goStringLiteral(getTableName(program, model))}`];
  const schemaName = getSchemaName(program, model);
  if (schemaName) {
    annotationParts.push(`Schema: ${goStringLiteral(schemaName)}`);
  }
  if (checks.length > 0) {
    annotationParts.push(`Checks: map[string]string{${checks.join(", ")}}`);
  }

  ctx.usesEntSql = true;
  ctx.usesEntSchema = true;
  return [`entsql.Annotation{${annotationParts.join(", ")}}`, "entsql.WithComments(true)"];
}
