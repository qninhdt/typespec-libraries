import { SourceFile } from "@alloy-js/core";
import type { Children } from "@alloy-js/core/jsx-runtime";
import type { Model, Program } from "@typespec/compiler";
import {
  buildCompositeUniqueColumns,
  camelToSnake,
  classifyProperties,
  collectCompositeTypeFields,
  generatedHeader,
  getColumnName,
  getDoc,
  isKey,
  type NormalizedOrmModel,
} from "@qninhdt/typespec-orm";
import { buildImportBlock } from "./ent-imports.js";
import { createEntFileContext } from "./ent-context.js";
import { buildEntField } from "./ent-field.js";
import { buildEntEdge } from "./ent-edge.js";
import { buildEntIndexes } from "./ent-index.js";
import { buildEntAnnotations } from "./ent-annotation.js";
import type { EntEmitterOptions } from "../lib.js";

export interface EntModelFileProps {
  readonly program: Program;
  readonly normalizedModel: NormalizedOrmModel;
  readonly modelLookup: Map<Model, NormalizedOrmModel>;
  readonly collectionStrategy?: EntEmitterOptions["collection-strategy"];
  readonly onUpdateEmitRawSql?: boolean;
}

export function EntModelFile(props: EntModelFileProps): Children {
  const { program, normalizedModel, collectionStrategy, onUpdateEmitRawSql } = props;
  const { model } = normalizedModel;
  const tableName = normalizedModel.tableName;
  const fileName = camelToSnake(model.name) + ".go";
  const ctx = createEntFileContext();

  const compositeTypeFields =
    normalizedModel.kind === "table" && tableName
      ? collectCompositeTypeFields(program, model, tableName)
      : [];
  const compositeUniqueColumns = buildCompositeUniqueColumns(compositeTypeFields);
  const {
    fields: regularProps,
    ignored,
    relations,
  } = classifyProperties(program, model, { ownPropertiesOnly: true });

  // Partition once: keys first, then non-keys. Avoids 3× isKey evaluations
  // per property that the previous `filter`/`filter` form incurred.
  const keyProps: typeof regularProps = [];
  const nonKeyProps: typeof regularProps = [];
  for (const entry of regularProps) {
    if (isKey(program, entry.prop)) keyProps.push(entry);
    else nonKeyProps.push(entry);
  }

  const fieldLines: string[] = [];
  const indexedFields = new Set<string>();
  for (const { prop } of [...keyProps, ...nonKeyProps]) {
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
    buildEntEdge(program, prop, resolved, ctx, props.modelLookup, { onUpdateEmitRawSql }),
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
  if (ctx.usesEntSchema) {
    ctx.packageImports.push({ alias: "entschema", path: "entgo.io/ent/schema" });
  }

  const lines: string[] = [];
  lines.push(`// ${generatedHeader}`);
  lines.push("// Source: https://github.com/qninhdt/typespec-libraries");
  lines.push("");
  lines.push("package schema");
  lines.push("");
  lines.push(buildImportBlock(ctx.imports, ctx.packageImports));
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

function indentEntBuilder(line: string): string {
  return (
    line
      .split("\n")
      .map((part, index) => `${index === 0 ? "\t\t" : "\t\t\t"}${part}`)
      .join("\n") + ","
  );
}
