import type { ModelProperty, Program, Type } from "@typespec/compiler";
import {
  deduplicateParts,
  getColumnName,
  getCompositeFields,
  getDefaultExpression,
  getDefaultValue,
  getDoc,
  getMaxLength,
  getPrecision,
  getScopes,
  isArrayType,
  isAutoCreateTime,
  isAutoIncrement,
  isAutoUpdateTime,
  isIndex,
  isKey,
  isSoftDelete,
  isUnique,
  resolveDbType,
} from "@qninhdt/typespec-orm";
import { goStringLiteral } from "./ent-string-utils.js";
import type { EntFileContext } from "./ent-context.js";
import { buildChain } from "./ent-context.js";
import { buildEntFieldBuilder } from "./ent-field-builder.js";
import { reportDiagnostic, type EntEmitterOptions } from "../lib.js";

export interface EntFieldResult {
  line: string;
  indexed: boolean;
}

/**
 * Builds the full Ent field declaration line (`field.X(...).Foo()....`) for a
 * single property, or returns undefined if the property has no emittable
 * column (composite types, unsupported kinds).
 */
export function buildEntField(
  program: Program,
  prop: ModelProperty,
  ctx: EntFileContext,
  collectionStrategy: EntEmitterOptions["collection-strategy"] | undefined,
  compositeUniqueColumns: Set<string>,
): EntFieldResult | undefined {
  const columnName = getColumnName(program, prop);
  if (
    resolveDbType(prop.type) === undefined &&
    prop.type.kind !== "Enum" &&
    !isArrayType(prop.type)
  ) {
    if (!getCompositeFields(program, prop)) {
      reportDiagnostic(program, {
        code: "unsupported-type",
        target: prop,
        format: { typeName: prop.type.kind, propName: prop.name },
      });
    }
    return undefined;
  }

  const builder = buildEntFieldBuilder(program, prop, columnName, ctx, collectionStrategy);
  const chains = buildCommonFieldChains(program, prop, ctx, compositeUniqueColumns, columnName);
  const docParts: string[] = [];
  const doc = getDoc(program, prop);
  if (doc) docParts.push(doc);
  // Surface field-level @scope so downstream tooling (codegen filters,
  // policy hooks) can grep for it without re-walking TypeSpec metadata.
  const scopes = getScopes(program, prop);
  if (scopes.length > 0) {
    docParts.push(`scope: ${scopes.join(", ")}`);
  }
  if (docParts.length > 0) {
    chains.push(`Comment(${goStringLiteral(docParts.join("\n"))})`);
  }
  if (prop.optional || isSoftDelete(program, prop)) {
    chains.push("Optional()");
    if (!builder.startsWith("field.JSON(")) {
      chains.push("Nillable()");
    }
  }
  if (isKey(program, prop)) chains.push("Immutable()");
  if (isUnique(program, prop) && !compositeUniqueColumns.has(columnName)) chains.push("Unique()");

  return {
    line: buildChain(builder, chains),
    indexed: isIndex(program, prop) || isSoftDelete(program, prop),
  };
}

function buildCommonFieldChains(
  program: Program,
  prop: ModelProperty,
  ctx: EntFileContext,
  _compositeUniqueColumns: Set<string>,
  _columnName: string,
): string[] {
  const chains: string[] = [];
  const dbType = resolveDbType(prop.type);
  const maxLen = getMaxLength(program, prop);
  if (maxLen !== undefined && (dbType === "string" || dbType === "text")) {
    chains.push(`MaxLen(${maxLen})`);
  }

  const prec = getPrecision(program, prop);
  if (dbType === "decimal") {
    ctx.imports.add("entgo.io/ent/dialect");
    const schema = prec ? `numeric(${prec.precision},${prec.scale})` : "numeric";
    chains.push(`SchemaType(map[string]string{dialect.Postgres: ${goStringLiteral(schema)}})`);
  }

  // Ent's `field.Time` defaults to `timestamp without time zone` on Postgres,
  // which silently strips offsets. `utcDateTime` is timezone-aware in TypeSpec,
  // so force `timestamptz`. `date`/`time` keep Ent's defaults.
  if (dbType === "utcDateTime") {
    ctx.imports.add("entgo.io/ent/dialect");
    chains.push(
      `SchemaType(map[string]string{dialect.Postgres: ${goStringLiteral("timestamptz")}})`,
    );
  }

  const defaultExpr = getDefaultExpression(program, prop);
  if (defaultExpr) {
    ctx.usesEntSql = true;
    chains.push(`Annotations(entsql.Default(${goStringLiteral(defaultExpr)}))`);
  } else {
    const defaultValue = getDefaultValue(program, prop);
    if (defaultValue !== undefined && !isKey(program, prop)) {
      const formatted = formatEntDefault(defaultValue, prop.type);
      if (formatted) {
        chains.push(`Default(${formatted})`);
      } else {
        reportDiagnostic(program, {
          code: "unsupported-type",
          target: prop,
          format: { typeName: `default(${prop.type.kind})`, propName: prop.name },
        });
      }
    }
  }

  if (isKey(program, prop) && dbType === "uuid") {
    const hasUserDefault =
      !!getDefaultExpression(program, prop) || getDefaultValue(program, prop) !== undefined;
    if (!hasUserDefault) {
      chains.push("Default(uuid.New)");
    }
  }
  if (isAutoCreateTime(program, prop)) {
    ctx.imports.add("time");
    chains.push("Default(time.Now)", "Immutable()");
  }
  if (isAutoUpdateTime(program, prop)) {
    ctx.imports.add("time");
    chains.push("Default(time.Now)", "UpdateDefault(time.Now)");
  }
  if (isAutoIncrement(program, prop) || dbType === "serial" || dbType === "bigserial") {
    chains.push("Positive()");
  }

  return deduplicateParts(chains);
}

function formatEntDefault(value: string, type: Type): string | undefined {
  if (type.kind === "ModelProperty") {
    return formatEntDefault(value, type.type);
  }
  const dbType = resolveDbType(type);
  if (dbType === "string" || dbType === "text" || type.kind === "Enum") {
    return goStringLiteral(value);
  }
  if (dbType === "boolean") {
    return value === "true" || value === "false" ? value : undefined;
  }
  if (
    dbType === "int8" ||
    dbType === "int16" ||
    dbType === "int32" ||
    dbType === "int64" ||
    dbType === "uint8" ||
    dbType === "uint16" ||
    dbType === "uint32" ||
    dbType === "uint64" ||
    dbType === "float32" ||
    dbType === "float64"
  ) {
    return value;
  }
  return undefined;
}
