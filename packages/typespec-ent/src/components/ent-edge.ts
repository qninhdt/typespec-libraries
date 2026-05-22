import type { ModelProperty, Program } from "@typespec/compiler";
import {
  camelToSnake,
  getOnDelete,
  type ResolvedRelation,
} from "@qninhdt/typespec-orm";
import { goStringLiteral } from "./EntConstants.js";
import { buildChain, type EntFileContext } from "./ent-context.js";
import { reportDiagnostic } from "../lib.js";
import { deduplicateParts } from "@qninhdt/typespec-orm";

/**
 * Builds an Ent edge declaration line for a relation property.
 * Picks owner vs. inverse for many-to-many deterministically using model
 * names so generation is stable and `ent generate` does not produce
 * duplicate join tables.
 */
export function buildEntEdge(
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
