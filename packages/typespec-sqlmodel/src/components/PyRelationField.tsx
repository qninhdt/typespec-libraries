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

/**
 * Generate a SQLModel Relationship() for a navigation property.
 */
export function generateRelationField(
  program: Program,
  prop: ModelProperty,
  rel: ResolvedRelation,
): string {
  const pyFieldName = camelToSnake(prop.name);
  const pyRefType = `"${rel.targetModel.name}"`;

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

  // For self-referential relationships, use remote_side pointing to PK (id)
  if (isSelfRef) {
    relArgs.push(`sa_relationship_kwargs={"remote_side": "${rel.targetModel.name}.id"}`);
  }

  if (isMany && rel.onDelete === "CASCADE") {
    relArgs.push('cascade="all, delete-orphan"');
  } else if (isMany && rel.onDelete === "SET NULL") {
    relArgs.push('cascade="save-update, merge"');
  }

  const doc = getDoc(program, prop);
  const docComment = doc ? `${FOUR_SPACES}# ${doc}\n` : "";
  return `${docComment}${FOUR_SPACES}${pyFieldName}: ${pyType} = Relationship(${relArgs.join(", ")})\n`;
}
