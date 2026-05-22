import type { ModelProperty, Program, Type } from "@typespec/compiler";
import {
  getArrayElementType,
  getDefaultExpression,
  getDefaultValue,
  getDoc,
  getColumnName,
  getCompositeFields,
  getMaxLength,
  getPrecision,
  getPropertyEnum,
  isArrayType,
  isAutoCreateTime,
  isAutoIncrement,
  isAutoUpdateTime,
  isIndex,
  isKey,
  isSoftDelete,
  isUnique,
  resolveDbType,
  deduplicateParts,
} from "@qninhdt/typespec-orm";
import { goStringLiteral } from "./EntConstants.js";
import { resolvePostgresArrayElementType } from "./ent-postgres-types.js";
import type { EntFileContext } from "./ent-context.js";
import { buildChain } from "./ent-context.js";
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
  const doc = getDoc(program, prop);
  if (doc) chains.push(`Comment(${goStringLiteral(doc)})`);
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

function buildEntFieldBuilder(
  program: Program,
  prop: ModelProperty,
  columnName: string,
  ctx: EntFileContext,
  collectionStrategy: EntEmitterOptions["collection-strategy"] | undefined,
): string {
  const enumInfo = getPropertyEnum(prop);
  if (enumInfo) {
    const values = enumInfo.members.map((member) => goStringLiteral(member.value)).join(", ");
    return `field.Enum(${goStringLiteral(columnName)}).Values(${values})`;
  }

  if (isArrayType(prop.type)) {
    return buildArrayFieldBuilder(program, prop, columnName, ctx, collectionStrategy);
  }

  const dbType = resolveDbType(prop.type);
  switch (dbType) {
    case "uuid":
      ctx.imports.add("github.com/google/uuid");
      return `field.UUID(${goStringLiteral(columnName)}, uuid.UUID{})`;
    case "text":
      return `field.Text(${goStringLiteral(columnName)})`;
    case "boolean":
      return `field.Bool(${goStringLiteral(columnName)})`;
    case "int8":
      return `field.Int8(${goStringLiteral(columnName)})`;
    case "int16":
      return `field.Int16(${goStringLiteral(columnName)})`;
    case "int32":
    case "serial":
      return `field.Int32(${goStringLiteral(columnName)})`;
    case "int64":
    case "bigserial":
      return `field.Int64(${goStringLiteral(columnName)})`;
    case "uint8":
      return `field.Uint8(${goStringLiteral(columnName)})`;
    case "uint16":
      return `field.Uint16(${goStringLiteral(columnName)})`;
    case "uint32":
      return `field.Uint32(${goStringLiteral(columnName)})`;
    case "uint64":
      return `field.Uint64(${goStringLiteral(columnName)})`;
    case "float32":
      return `field.Float32(${goStringLiteral(columnName)})`;
    case "float64":
      return `field.Float(${goStringLiteral(columnName)})`;
    case "decimal":
      ctx.imports.add("github.com/shopspring/decimal");
      return `field.Other(${goStringLiteral(columnName)}, decimal.Decimal{})`;
    case "utcDateTime":
    case "date":
    case "time":
      return `field.Time(${goStringLiteral(columnName)})`;
    case "duration":
      return `field.Duration(${goStringLiteral(columnName)})`;
    case "bytes":
      return `field.Bytes(${goStringLiteral(columnName)})`;
    case "jsonb":
      return `field.JSON(${goStringLiteral(columnName)}, map[string]any{})`;
    case "string":
    default:
      return `field.String(${goStringLiteral(columnName)})`;
  }
}

function buildArrayFieldBuilder(
  program: Program,
  prop: ModelProperty,
  columnName: string,
  ctx: EntFileContext,
  collectionStrategy: EntEmitterOptions["collection-strategy"] | undefined,
): string {
  const elementType = getArrayElementType(prop.type);
  const elementDbType = elementType ? resolveDbType(elementType) : undefined;
  if (collectionStrategy === "postgres") {
    if (elementDbType) {
      const postgresType = resolvePostgresArrayElementType(elementDbType);
      if (postgresType) {
        ctx.imports.add("entgo.io/ent/dialect");
        return `field.JSON(${goStringLiteral(columnName)}, []${resolveGoArrayElementType(elementType)}{}).SchemaType(map[string]string{dialect.Postgres: "${postgresType}[]"})`;
      }
      reportDiagnostic(program, {
        code: "unsupported-type",
        target: prop,
        format: { typeName: `${elementDbType}[]`, propName: prop.name },
      });
    }
  }
  return `field.JSON(${goStringLiteral(columnName)}, []${resolveGoArrayElementType(elementType)}{})`;
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
  if (prec && dbType === "decimal") {
    ctx.imports.add("entgo.io/ent/dialect");
    chains.push(
      `SchemaType(map[string]string{dialect.Postgres: ${goStringLiteral(`numeric(${prec.precision},${prec.scale})`)}})`,
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

function resolveGoArrayElementType(type: Type | undefined): string {
  if (!type) return "any";
  if (type.kind === "Enum") return "string";
  const dbType = resolveDbType(type);
  switch (dbType) {
    case "uuid":
      return "uuid.UUID";
    case "boolean":
      return "bool";
    case "int8":
      return "int8";
    case "int16":
      return "int16";
    case "int32":
    case "serial":
      return "int32";
    case "int64":
    case "bigserial":
      return "int64";
    case "uint8":
      return "uint8";
    case "uint16":
      return "uint16";
    case "uint32":
      return "uint32";
    case "uint64":
      return "uint64";
    case "float32":
      return "float32";
    case "float64":
    case "decimal":
      return "float64";
    case "string":
    case "text":
    default:
      return "string";
  }
}
