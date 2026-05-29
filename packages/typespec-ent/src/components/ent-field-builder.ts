import type { ModelProperty, Program, Type } from "@typespec/compiler";
import {
  camelToSnake,
  getArrayElementType,
  getColumnName,
  getGoType,
  getPropertyEnum,
  isArrayType,
  resolveDbType,
} from "@qninhdt/typespec-orm";
import { goStringLiteral } from "./ent-string-utils.js";
import { resolvePostgresArrayElementType } from "./ent-postgres-types.js";
import type { EntFileContext } from "./ent-context.js";
import { reportDiagnostic, type EntEmitterOptions } from "../lib.js";

/**
 * Pick the appropriate `field.X(...)` builder for a property's TypeSpec type.
 * Side-effects: registers required Go imports and entsql usage flags on
 * `ctx`. Returns `undefined` when the property's type cannot be mapped, after
 * reporting an `unsupported-type` diagnostic. Callers must skip the field
 * (emit no Go) when this returns `undefined`.
 */
export function buildEntFieldBuilder(
  program: Program,
  prop: ModelProperty,
  columnName: string,
  ctx: EntFileContext,
  collectionStrategy: EntEmitterOptions["collection-strategy"] | undefined,
): string | undefined {
  const enumInfo = getPropertyEnum(prop);
  if (enumInfo) {
    const values = enumInfo.members.map((member) => goStringLiteral(member.value)).join(", ");
    // Map TypeSpec enum -> native Postgres ENUM type. SchemaType locks the
    // SQL column to the named ENUM; Atlas picks this up to emit
    // `CREATE TYPE foo AS ENUM (...)` automatically.
    const pgEnumName = camelToSnake(enumInfo.enumType.name);
    ctx.imports.add("entgo.io/ent/dialect");
    return (
      `field.Enum(${goStringLiteral(columnName)}).` +
      `Values(${values}).` +
      `SchemaType(map[string]string{dialect.Postgres: ${goStringLiteral(pgEnumName)}})`
    );
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
    case "jsonb": {
      const goType = getGoType(program, prop);
      if (goType && goType.importPath && goType.typeName) {
        ctx.imports.add(goType.importPath);
        const pkg = goType.importPath.split("/").at(-1) ?? "";
        // Use the value form (`pkg.Type{}`) rather than `&pkg.Type{}` so the
        // resolved Ent Go field type is the named type itself, not a pointer
        // to it. Pointer-typed JSON fields are rare and require an explicit
        // pointer-style spec hook (out of scope here). Slice/map goType
        // values like `encoding/json.RawMessage` simply do not work as a
        // pointer literal.
        return `field.JSON(${goStringLiteral(columnName)}, ${pkg}.${goType.typeName}{})`;
      }
      return `field.JSON(${goStringLiteral(columnName)}, map[string]any{})`;
    }
    case "tsvector":
      ctx.imports.add("entgo.io/ent/dialect");
      return (
        `field.String(${goStringLiteral(columnName)}).` +
        `SchemaType(map[string]string{dialect.Postgres: ${goStringLiteral("tsvector")}})`
      );
    case "tsquery":
      ctx.imports.add("entgo.io/ent/dialect");
      return (
        `field.String(${goStringLiteral(columnName)}).` +
        `SchemaType(map[string]string{dialect.Postgres: ${goStringLiteral("tsquery")}})`
      );
    case "citext":
      ctx.imports.add("entgo.io/ent/dialect");
      return (
        `field.String(${goStringLiteral(columnName)}).` +
        `SchemaType(map[string]string{dialect.Postgres: ${goStringLiteral("citext")}})`
      );
    case "ipv4":
    case "ipv6":
    case "inet":
      ctx.imports.add("entgo.io/ent/dialect");
      return (
        `field.String(${goStringLiteral(columnName)}).` +
        `SchemaType(map[string]string{dialect.Postgres: ${goStringLiteral("inet")}})`
      );
    case "cidr":
      ctx.imports.add("entgo.io/ent/dialect");
      return (
        `field.String(${goStringLiteral(columnName)}).` +
        `SchemaType(map[string]string{dialect.Postgres: ${goStringLiteral("cidr")}})`
      );
    case "string":
      return `field.String(${goStringLiteral(columnName)})`;
    default:
      reportDiagnostic(program, {
        code: "unsupported-type",
        target: prop,
        format: { typeName: dbType ?? "unknown", propName: prop.name },
      });
      return undefined;
  }
}

function buildArrayFieldBuilder(
  program: Program,
  prop: ModelProperty,
  columnName: string,
  ctx: EntFileContext,
  collectionStrategy: EntEmitterOptions["collection-strategy"] | undefined,
): string | undefined {
  const elementType = getArrayElementType(prop.type);
  const elementDbType = elementType ? resolveDbType(elementType) : undefined;
  if (collectionStrategy === "postgres") {
    if (elementDbType) {
      const postgresType = resolvePostgresArrayElementType(elementDbType);
      if (postgresType) {
        const goElement = resolveGoArrayElementType(program, prop, elementType);
        if (goElement === undefined) return undefined;
        ctx.imports.add("entgo.io/ent/dialect");
        return `field.JSON(${goStringLiteral(columnName)}, []${goElement}{}).SchemaType(map[string]string{dialect.Postgres: "${postgresType}[]"})`;
      }
      reportDiagnostic(program, {
        code: "unsupported-type",
        target: prop,
        format: { typeName: `${elementDbType}[]`, propName: prop.name },
      });
      return undefined;
    }
  }
  const goElement = resolveGoArrayElementType(program, prop, elementType);
  if (goElement === undefined) return undefined;
  return `field.JSON(${goStringLiteral(columnName)}, []${goElement}{})`;
}

function resolveGoArrayElementType(
  program: Program,
  prop: ModelProperty,
  type: Type | undefined,
): string | undefined {
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
      return "string";
    default:
      reportDiagnostic(program, {
        code: "unsupported-type",
        target: prop,
        format: { typeName: `${dbType ?? "unknown"}[]`, propName: prop.name },
      });
      return undefined;
  }
}

// `getColumnName` is re-exported to keep the field-builder module self-sufficient
// for callers that want to derive a column from a property without adding a
// second import.
export { getColumnName };
