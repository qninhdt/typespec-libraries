import type { Model, ModelProperty, Program } from "@typespec/compiler";
import {
  camelToSnake,
  getOnDelete,
  getOnUpdate,
  isKey,
  isManyToManyOwner,
  type NormalizedOrmModel,
  type ResolvedRelation,
} from "@qninhdt/typespec-orm";
import { goStringLiteral } from "./EntConstants.js";
import { buildChain, type EntFileContext } from "./ent-context.js";
import { reportDiagnostic } from "../lib.js";
import { deduplicateParts } from "@qninhdt/typespec-orm";

export interface EntEdgeOptions {
  /**
   * When true, surface ON UPDATE actions as a `Comment("on_update: <action>")`
   * Ent annotation that downstream Atlas tooling can detect via custom rules.
   * When false (default), ON UPDATE is dropped with the existing warning.
   */
  readonly onUpdateEmitRawSql?: boolean;
}

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
  modelLookup?: Map<Model, NormalizedOrmModel>,
  options?: EntEdgeOptions,
): string {
  const edgeName = camelToSnake(prop.name);
  const targetType = `${rel.targetModel.name}.Type`;
  const chains: string[] = [];

  // Ent generates all schemas into a single Go package (`ent/schema`), but the
  // ORM normalization preserves namespace-derived Go packages for downstream
  // tooling. If the source and target tables resolve to different namespaces,
  // the user has likely modeled a relation that crosses bounded contexts in a
  // way Ent will silently flatten — surface that mismatch instead.
  const sourceModel = prop.model;
  if (modelLookup && sourceModel) {
    const sourceInfo = modelLookup.get(sourceModel);
    const targetInfo = modelLookup.get(rel.targetModel);
    if (sourceInfo && targetInfo && sourceInfo.namespaceDir !== targetInfo.namespaceDir) {
      reportDiagnostic(program, {
        code: "cross-package-edge",
        target: prop,
        format: {
          propName: prop.name,
          sourceModel: sourceModel.name,
          targetModel: rel.targetModel.name,
          sourcePackage: sourceInfo.namespaceDir || "<root>",
          targetPackage: targetInfo.namespaceDir || "<root>",
        },
      });
    }
  }

  // Ent edges always reference the target's primary key. `@foreignKey("col",
  // "otherCol")` referencing a non-`@key` column is silently dropped by Ent —
  // catch it here.
  if (
    (rel.kind === "many-to-one" || rel.kind === "one-to-one") &&
    !isKey(program, rel.targetProperty)
  ) {
    reportDiagnostic(program, {
      code: "referenced-column-fk-not-supported-by-ent",
      target: prop,
      format: {
        propName: prop.name,
        targetModel: rel.targetModel.name,
        targetColumn: rel.fkTargetColumn,
      },
    });
  }

  let builder: string;
  if (rel.kind === "many-to-many") {
    // Ent requires exactly one side of a M2M relation to own the join table
    // (emits `edge.To(...).StorageKey(...)`); the other side must be the
    // inverse (emits `edge.From(...).Ref(...)`). Otherwise `ent generate`
    // produces duplicate join tables.
    //
    // Owner selection precedence:
    //   1. @manyToManyOwner on this side wins.
    //   2. @manyToManyOwner on the other side loses (we are inverse).
    //   3. Both sides marked → error.
    //   4. Neither side marked → fall back to alphabetic with a warning so
    //      a future model rename does not silently rotate join-table column
    //      order.
    const ownerName = prop.model?.name ?? "";
    const targetName = rel.targetModel.name;
    const thisOwnerMark = isManyToManyOwner(program, prop);
    const inverseProp = rel.inverseProperty;
    const inverseOwnerMark =
      inverseProp !== undefined ? isManyToManyOwner(program, inverseProp) : false;

    let isOwner: boolean;
    if (ownerName === targetName) {
      // Self-M2M: keep existing back-reference logic.
      if (!rel.backPopulates) {
        reportDiagnostic(program, {
          code: "missing-back-reference",
          target: prop,
          format: {
            propName: prop.name,
            modelName: ownerName,
          },
        });
        isOwner = true;
      } else {
        isOwner = edgeName < rel.backPopulates;
      }
    } else if (thisOwnerMark && inverseOwnerMark) {
      reportDiagnostic(program, {
        code: "m2m-owner-conflict",
        target: prop,
        format: { propName: prop.name, modelName: ownerName, targetModel: targetName },
      });
      isOwner = ownerName < targetName;
    } else if (thisOwnerMark) {
      isOwner = true;
    } else if (inverseOwnerMark) {
      isOwner = false;
    } else {
      // Fall back to alphabetic ordering, but only warn from the would-be
      // owner side so the diagnostic fires once per relation.
      const wouldBeOwner = ownerName < targetName;
      if (wouldBeOwner) {
        reportDiagnostic(program, {
          code: "m2m-owner-ambiguous",
          target: prop,
          format: { propName: prop.name, modelName: ownerName, targetModel: targetName },
        });
      }
      isOwner = wouldBeOwner;
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
  const onUpdate = getOnUpdate(program, prop) ?? rel.onUpdate;
  if (onUpdate) {
    if (options?.onUpdateEmitRawSql) {
      // Escape hatch: surface the action as a Comment marker so downstream
      // Atlas custom rules can apply ON UPDATE in raw SQL. We deliberately
      // don't synthesize a real trigger here — that's left to the consumer.
      chains.push(`Comment(${goStringLiteral(`on_update: ${onUpdate}`)})`);
    } else {
      reportDiagnostic(program, {
        code: "on-update-not-supported-by-ent",
        target: prop,
        format: { action: onUpdate, relationName: prop.name },
      });
    }
  }
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
