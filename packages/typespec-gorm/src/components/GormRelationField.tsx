/**
 * GormRelationField - Functions for relation struct field lines.
 *
 * Returns plain strings. Called imperatively by GormStruct.
 */

import type { ModelProperty, Program } from "@typespec/compiler";
import type { ResolvedRelation } from "@qninhdt/typespec-orm";
import { camelToPascal, getDoc } from "@qninhdt/typespec-orm";
import { buildDocComment } from "./GormConstants.js";

/**
 * Generate a relation navigation struct field line.
 */
export function generateRelationFieldLine(
  program: Program,
  prop: ModelProperty,
  rel: ResolvedRelation,
  targetType: string,
): string {
  const fieldName = camelToPascal(prop.name);
  const doc = getDoc(program, prop);
  const docComment = buildDocComment(doc);

  // Determine Go type based on relation kind
  const isMany = rel.kind === "one-to-many" || rel.kind === "many-to-many";
  const goType = isMany ? `[]${targetType}` : prop.optional ? `*${targetType}` : targetType;

  // Build GORM tag parts
  const tagParts: string[] = [];
  if (rel.kind === "many-to-many") {
    tagParts.push(`many2many:${rel.joinTable}`);
  } else {
    tagParts.push(`foreignKey:${camelToPascal(rel.localProperty.name)}`);
    tagParts.push(`references:${camelToPascal(rel.targetProperty.name)}`);
  }

  // Add cascade constraints
  const constraintParts: string[] = [];
  if (rel.onDelete) constraintParts.push(`OnDelete:${rel.onDelete}`);
  if (rel.onUpdate) constraintParts.push(`OnUpdate:${rel.onUpdate}`);
  if (constraintParts.length > 0) {
    tagParts.push(`constraint:${constraintParts.join(",")}`);
  }

  const gormTag = tagParts.join(";");
  const jsonOmit = prop.optional ? ",omitempty" : "";

  return `${docComment}\t${fieldName} ${goType} \`gorm:"${gormTag}" json:"${prop.name}${jsonOmit}"\`\n`;
}
