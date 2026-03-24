/**
 * PyRelationField -Functions for SQLModel relation field generation.
 *
 * Returns plain strings. Called imperatively by PyModel.
 */

import type { Model, ModelProperty, Program } from "@typespec/compiler";
import type { ResolvedRelation } from "@qninhdt/typespec-orm";
import { camelToSnake, getDoc } from "@qninhdt/typespec-orm";
import { reportDiagnostic } from "../lib.js";
import { FOUR_SPACES } from "./PyConstants.js";

const CASCADE_DELETE_ORPHAN = '"cascade": "all, delete-orphan"';
const CASCADE_SAVE_UPDATE = '"cascade": "save-update, merge"';

/**
 * Generate a SQLModel Relationship() for a navigation property.
 * Returns both the field code and the target model name for imports.
 */
export function generateRelationField(
  program: Program,
  prop: ModelProperty,
  rel: ResolvedRelation,
  manyToManySecondary?: string,
): { field: string; targetModel: Model } {
  const pyFieldName = camelToSnake(prop.name);
  const targetModelName = rel.targetModel.name;
  const pyRefType = targetModelName;

  const isMany = rel.kind === "one-to-many" || rel.kind === "many-to-many";
  const pyType = isMany ? `list[${pyRefType}]` : `${pyRefType} | None`;

  const relArgs: string[] = [];

  if (rel.backPopulates) {
    relArgs.push(`back_populates="${rel.backPopulates}"`);
  }

  if (rel.kind === "one-to-many" && !rel.backPopulates) {
    reportDiagnostic(program, {
      code: "missing-back-reference",
      format: {
        propName: prop.name,
        modelName: (prop.model as Model)?.name ?? "<unknown>",
        targetModel: rel.targetModel.name,
      },
      target: prop,
    });
  }

  const isSelfRef =
    (rel.kind === "many-to-one" || rel.kind === "one-to-one") && prop.model === rel.targetModel;

  const doc = getDoc(program, prop);
  const docComment = doc ? `${FOUR_SPACES}# ${doc}\n` : "";

  // For self-referential relationships:
  // 1. Use remote_side pointing to PK (id)
  // 2. Use string quotes in type annotation for forward reference
  if (isSelfRef) {
    relArgs.push(
      `sa_relationship_kwargs={"remote_side": "${rel.targetModel.name}.${rel.targetProperty.name}"}`,
    );
    // Use string quotes for forward reference in type annotation
    return {
      field: `${docComment}${FOUR_SPACES}${pyFieldName}: "${pyType}" = Relationship(${relArgs.join(", ")})\n`,
      targetModel: rel.targetModel,
    };
  }

  // Track sa_relationship_kwargs for merging
  const saRelKwArgs: string[] = [];

  if (rel.kind === "many-to-many" && manyToManySecondary) {
    saRelKwArgs.push(`"secondary": ${manyToManySecondary}`);
  } else if (isMany && rel.onDelete === "CASCADE") {
    saRelKwArgs.push(CASCADE_DELETE_ORPHAN);
  } else if (isMany && rel.onDelete === "SET NULL") {
    saRelKwArgs.push(CASCADE_SAVE_UPDATE);
  }

  // Add any sa_relationship_kwargs to relArgs
  if (saRelKwArgs.length > 0) {
    relArgs.push(`sa_relationship_kwargs={${saRelKwArgs.join(", ")}}`);
  }

  const field = `${docComment}${FOUR_SPACES}${pyFieldName}: ${pyType} = Relationship(${relArgs.join(", ")})\n`;
  return { field, targetModel: rel.targetModel };
}
