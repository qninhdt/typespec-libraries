import { SourceFile } from "@alloy-js/core";
import type { Children } from "@alloy-js/core/jsx-runtime";
import type { Model, ModelProperty, Program, Type } from "@typespec/compiler";
import {
  buildCompositeUniqueColumns,
  camelToSnake,
  classifyProperties,
  collectCompositeTypeFields,
  deduplicateParts,
  generatedHeader,
  getArrayElementType,
  getCheck,
  getColumnName,
  getCompositeFields,
  getDefaultValue,
  getDefaultExpression,
  getDoc,
  getMaxLength,
  getOnDelete,
  getPrecision,
  getSchemaName,
  getPropertyEnum,
  getTableName,
  isArrayType,
  isAutoCreateTime,
  isAutoIncrement,
  isAutoUpdateTime,
  isIndex,
  isKey,
  isSoftDelete,
  isUnique,
  resolveDbType,
  type CompositeTypeField,
  type NormalizedOrmModel,
  type ResolvedRelation,
} from "@qninhdt/typespec-orm";
import { goStringLiteral } from "./EntConstants.js";
import { resolvePostgresArrayElementType } from "./ent-postgres-types.js";
import { buildImportBlock } from "./ent-imports.js";
import { reportDiagnostic, type EntEmitterOptions } from "../lib.js";

export interface EntModelFileProps {
  readonly program: Program;
  readonly normalizedModel: NormalizedOrmModel;
  readonly modelLookup: Map<Model, NormalizedOrmModel>;
  readonly collectionStrategy?: EntEmitterOptions["collection-strategy"];
}

interface EntFileContext {
  imports: Set<string>;
  usesEntSql: boolean;
  usesEntSchema: boolean;
}

interface EntFieldResult {
  line: string;
  indexed: boolean;
}

export function EntModelFile(props: EntModelFileProps): Children {
  const { program, normalizedModel, collectionStrategy } = props;
  const { model } = normalizedModel;
  const tableName = normalizedModel.tableName;
  const fileName = camelToSnake(model.name) + ".go";
  const ctx: EntFileContext = {
    imports: new Set(["entgo.io/ent"]),
    usesEntSql: false,
    usesEntSchema: false,
  };

  const compositeTypeFields =
    normalizedModel.kind === "table" && tableName
      ? collectCompositeTypeFields(program, model, tableName)
      : [];
  const compositeUniqueColumns = buildCompositeUniqueColumns(compositeTypeFields);
  const {
    fields: regularProps,
    ignored,
    relations,
  } = classifyProperties(program, model, {
    ownPropertiesOnly: true,
  });

  const fieldLines: string[] = [];
  const indexedFields = new Set<string>();
  for (const { prop } of [
    ...regularProps.filter(({ prop }) => isKey(program, prop)),
    ...regularProps.filter(({ prop }) => !isKey(program, prop)),
  ]) {
    const result = buildEntField(program, prop, ctx, collectionStrategy, compositeUniqueColumns);
    if (!result) continue;
    fieldLines.push(result.line);
    if (result.indexed) {
      indexedFields.add(getColumnName(program, prop));
    }
  }

  // @ignore'd properties are excluded from the database schema entirely:
  // no Ent field, no column. They remain part of the in-memory model only.
  void ignored;

  const edgeLines = relations.map(({ prop, resolved }) =>
    buildEntEdge(program, prop, resolved, ctx),
  );
  const indexLines = buildEntIndexes(program, model, compositeTypeFields, indexedFields, ctx);
  const annotationLines = buildEntAnnotations(program, model, normalizedModel, ctx);
  const mixinLines = normalizedModel.mixins.map((source) => `${source.name}{}`);

  if (fieldLines.length > 0) ctx.imports.add("entgo.io/ent/schema/field");
  if (edgeLines.length > 0) ctx.imports.add("entgo.io/ent/schema/edge");
  if (indexLines.length > 0) ctx.imports.add("entgo.io/ent/schema/index");
  if (normalizedModel.kind === "mixin") {
    ctx.imports.add("entgo.io/ent/schema/mixin");
  }
  if (ctx.usesEntSql) ctx.imports.add("entgo.io/ent/dialect/entsql");
  if (ctx.usesEntSchema) ctx.imports.add(`entschema "entgo.io/ent/schema"`);

  const lines: string[] = [];
  lines.push(`// ${generatedHeader}`);
  lines.push("// Source: https://github.com/qninhdt/typespec-libraries");
  lines.push("");
  lines.push("package schema");
  lines.push("");
  lines.push(buildImportBlock(ctx.imports));
  lines.push("");
  const doc = getDoc(program, model);
  lines.push(
    doc
      ? `// ${model.name} ${doc}`
      : normalizedModel.kind === "mixin"
        ? `// ${model.name} is a reusable Ent mixin.`
        : `// ${model.name} holds the schema definition for the ${tableName} table.`,
  );
  lines.push(`type ${model.name} struct {`);
  lines.push(normalizedModel.kind === "mixin" ? "\tmixin.Schema" : "\tent.Schema");
  lines.push("}");
  lines.push("");

  if (annotationLines.length > 0) {
    lines.push(`func (${model.name}) Annotations() []entschema.Annotation {`);
    lines.push("\treturn []entschema.Annotation{");
    lines.push(annotationLines.map((line) => `\t\t${line},`).join("\n"));
    lines.push("\t}");
    lines.push("}");
    lines.push("");
  }

  if (mixinLines.length > 0) {
    lines.push(`func (${model.name}) Mixin() []ent.Mixin {`);
    lines.push("\treturn []ent.Mixin{");
    lines.push(mixinLines.map((line) => `\t\t${line},`).join("\n"));
    lines.push("\t}");
    lines.push("}");
    lines.push("");
  }

  lines.push(`func (${model.name}) Fields() []ent.Field {`);
  lines.push("\treturn []ent.Field{");
  lines.push(fieldLines.map((line) => indentEntBuilder(line)).join("\n"));
  lines.push("\t}");
  lines.push("}");
  lines.push("");

  if (edgeLines.length > 0) {
    lines.push(`func (${model.name}) Edges() []ent.Edge {`);
    lines.push("\treturn []ent.Edge{");
    lines.push(edgeLines.map((line) => indentEntBuilder(line)).join("\n"));
    lines.push("\t}");
    lines.push("}");
    lines.push("");
  }

  if (indexLines.length > 0) {
    lines.push(`func (${model.name}) Indexes() []ent.Index {`);
    lines.push("\treturn []ent.Index{");
    lines.push(indexLines.map((line) => indentEntBuilder(line)).join("\n"));
    lines.push("\t}");
    lines.push("}");
    lines.push("");
  }

  return (
    <SourceFile path={fileName} filetype="go" printWidth={9999}>
      {lines.join("\n")}
    </SourceFile>
  );
}

function buildEntField(
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
  const chains = buildCommonFieldChains(program, prop, columnName, ctx, compositeUniqueColumns);
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
  _columnName: string,
  ctx: EntFileContext,
  _compositeUniqueColumns: Set<string>,
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
    chains.push(
      `Annotations(entsql.Default(${goStringLiteral(defaultExpr)}))`,
    );
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
    const hasUserDefault = !!getDefaultExpression(program, prop) || getDefaultValue(program, prop) !== undefined;
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

function buildEntEdge(
  program: Program,
  prop: ModelProperty,
  rel: ResolvedRelation,
  ctx: EntFileContext,
): string {
  const edgeName = camelToSnake(prop.name);
  const targetType = `${rel.targetModel.name}.Type`;
  const chains: string[] = [];

  let builder: string;
  if (rel.kind === "many-to-many") {
    // Ent requires exactly one side of a M2M relation to own the join table
    // (emits `edge.To(...).StorageKey(...)`); the other side must be the
    // inverse (emits `edge.From(...).Ref(...)`). Otherwise `ent generate`
    // produces duplicate join tables. The normalized ORM graph does not
    // expose an explicit owning flag for shorthand `@manyToMany`, so we
    // pick the owning side deterministically: the model whose name compares
    // alphabetically <= the target model's name owns the relation.
    const ownerName = prop.model?.name ?? "";
    const targetName = rel.targetModel.name;
    let isOwner: boolean;
    if (ownerName === targetName) {
      if (!rel.backPopulates) {
        reportDiagnostic(program, {
          code: "unsupported-type",
          target: prop,
          format: { typeName: "self-many-to-many-without-backPopulates", propName: prop.name },
        });
        isOwner = true;
      } else {
        isOwner = edgeName < rel.backPopulates;
      }
    } else {
      isOwner = ownerName < targetName;
    }

    if (isOwner) {
      builder = `edge.To(${goStringLiteral(edgeName)}, ${targetType})`;
      if (rel.joinTable) {
        const localPk = rel.fkColumnName;
        const targetPk = rel.fkTargetColumn;
        const ownerCol = `${camelToSnake(ownerName)}_${localPk}`;
        const inverseCol = `${camelToSnake(targetName)}_${targetPk}`;
        chains.push(
          `StorageKey(edge.Table(${goStringLiteral(rel.joinTable)}), edge.Columns(${goStringLiteral(ownerCol)}, ${goStringLiteral(inverseCol)}))`,
        );
      }
    } else {
      builder = `edge.From(${goStringLiteral(edgeName)}, ${targetType})`;
      if (rel.backPopulates) {
        chains.push(`Ref(${goStringLiteral(rel.backPopulates)})`);
      }
    }
  } else if (rel.kind === "one-to-many") {
    builder = `edge.To(${goStringLiteral(edgeName)}, ${targetType})`;
    chains.push(`StorageKey(edge.Column(${goStringLiteral(rel.fkColumnName)}))`);
  } else if (rel.backPopulates) {
    builder = `edge.From(${goStringLiteral(edgeName)}, ${targetType})`;
    chains.push(`Ref(${goStringLiteral(camelToSnake(rel.backPopulates))})`);
    chains.push(`Field(${goStringLiteral(rel.fkColumnName)})`);
    chains.push("Unique()");
  } else {
    builder = `edge.To(${goStringLiteral(edgeName)}, ${targetType})`;
    chains.push(`Field(${goStringLiteral(rel.fkColumnName)})`);
    chains.push("Unique()");
  }

  if (rel.kind === "one-to-one") {
    chains.push("Unique()");
  }
  if (!rel.localProperty.optional && rel.kind !== "one-to-many" && rel.kind !== "many-to-many") {
    chains.push("Required()");
  }
  const onDelete = getOnDelete(program, prop) ?? rel.onDelete;
  // entgo.io/ent/dialect/entsql does not export OnUpdate; @onUpdate is preserved
  // in the ORM graph for downstream emitters (DBML, SQLModel) but cannot be
  // surfaced through Ent's edge annotation API. Apply ON UPDATE via Atlas/SQL.
  const annotations: string[] = [];
  if (onDelete) {
    annotations.push(`entsql.OnDelete(${formatEntReferentialAction(onDelete)})`);
  }
  if (annotations.length > 0) {
    chains.push(`Annotations(${annotations.join(", ")})`);
    ctx.usesEntSql = true;
  }

  return buildChain(builder, deduplicateParts(chains));
}

function buildEntIndexes(
  program: Program,
  model: Model,
  compositeTypeFields: CompositeTypeField[],
  indexedFields: Set<string>,
  _ctx: EntFileContext,
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

function buildEntAnnotations(
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

function buildChain(builder: string, chains: string[]): string {
  if (chains.length === 0) {
    return builder;
  }
  return [builder, ...chains].join(".\n");
}

function indentEntBuilder(line: string): string {
  return (
    line
      .split("\n")
      .map((part, index) => `${index === 0 ? "\t\t" : "\t\t\t"}${part}`)
      .join("\n") + ","
  );
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

function formatEntReferentialAction(action: string): string {
  switch (action.toUpperCase().replaceAll(" ", "_")) {
    case "CASCADE":
      return "entsql.Cascade";
    case "SET_NULL":
      return "entsql.SetNull";
    case "NO_ACTION":
      return "entsql.NoAction";
    case "RESTRICT":
      return "entsql.Restrict";
    default:
      return "entsql.NoAction";
  }
}
