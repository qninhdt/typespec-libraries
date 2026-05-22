import type { Model, Program } from "@typespec/compiler";
import {
  findTenantIdProperty,
  findVersionProperty,
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
    if (check) {
      checks.push(`${goStringLiteral(check.name)}: ${goStringLiteral(check.expression)}`);
    }

    // Polymorphic discriminator → synthesize a check enumerating allowed types.
    const polymorphic = getPolymorphicConfig(program, prop);
    if (polymorphic && polymorphic.allowedTypes.length > 0) {
      const columnName = getColumnName(program, prop);
      const tableName = getTableName(program, model);
      const checkName = `${tableName}_${columnName}_polymorphic`;
      const valuesList = polymorphic.allowedTypes
        .map((value) => `'${escapeSqlLiteral(value)}'`)
        .join(", ");
      const expression = `${columnName} IN (${valuesList})`;
      checks.push(`${goStringLiteral(checkName)}: ${goStringLiteral(expression)}`);
      // Reference fully-qualified name for future codegraph hooks.
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

  // Surface ORM-core decorators (@version / @tenantId) as a Comment marker
  // on the table-level entsql.Annotation. Downstream policy/hook code can
  // grep for these markers without us inventing automatic indexes.
  const markers: string[] = [];
  const versionProp = findVersionProperty(program, model);
  if (versionProp) {
    markers.push(`version:${getColumnName(program, versionProp)}`);
  }
  const tenantProp = findTenantIdProperty(program, model);
  if (tenantProp) {
    markers.push(`tenant_id:${getColumnName(program, tenantProp)}`);
  }
  if (markers.length > 0) {
    annotationParts.push(`Comment: ${goStringLiteral(markers.join(";"))}`);
  }

  ctx.usesEntSql = true;
  ctx.usesEntSchema = true;
  return [`entsql.Annotation{${annotationParts.join(", ")}}`, "entsql.WithComments(true)"];
}

function escapeSqlLiteral(value: string): string {
  return value.replaceAll("'", "''");
}
