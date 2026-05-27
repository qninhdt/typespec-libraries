import type { Model, Program } from "@typespec/compiler";
import {
  getCheck,
  getColumnName,
  getPolymorphicConfig,
  getSchemaName,
  getTableName,
  getTypeFullName,
  type NormalizedOrmModel,
} from "@qninhdt/typespec-orm";
import { goStringLiteral } from "./EntConstants.js";
import type { EntFileContext } from "./ent-context.js";

export interface EntAnnotationsResult {
  /** Lines that go inside the `Annotations()` returned slice. */
  readonly annotations: string[];
}

/**
 * Builds the body of the `Annotations()` method for a table-kind schema.
 * Returns empty results for non-table kinds (mixins). Mutates `ctx` to
 * record that entsql/entschema imports are required when annotations exist.
 */
export function buildEntAnnotations(
  program: Program,
  model: Model,
  normalizedModel: NormalizedOrmModel,
  ctx: EntFileContext,
): EntAnnotationsResult {
  if (normalizedModel.kind !== "table") {
    return { annotations: [] };
  }

  const checks: string[] = [];
  for (const prop of model.properties.values()) {
    const check = getCheck(program, prop);
    if (check) {
      checks.push(`${goStringLiteral(check.name)}: ${goStringLiteral(check.expression)}`);
    }

    const polymorphic = getPolymorphicConfig(program, prop);
    if (polymorphic && polymorphic.check && polymorphic.allowedTypes.length > 0) {
      const columnName = getColumnName(program, prop);
      const tableName = getTableName(program, model);
      const checkName = `${tableName}_${columnName}_polymorphic`;
      const valuesList = polymorphic.allowedTypes
        .map((value) => `'${escapeSqlLiteral(value)}'`)
        .join(", ");
      const expression = `${columnName} IN (${valuesList})`;
      checks.push(`${goStringLiteral(checkName)}: ${goStringLiteral(expression)}`);
      void getTypeFullName;
    }
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
  return {
    annotations: [`entsql.Annotation{${annotationParts.join(", ")}}`, "entsql.WithComments(true)"],
  };
}

function escapeSqlLiteral(value: string): string {
  return value.replaceAll("'", "''");
}
