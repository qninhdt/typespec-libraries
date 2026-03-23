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
 * Convert a snake_case FK column name to PascalCase Go field name.
 * e.g., "user_id" → "UserID", "owner_id" → "OwnerID"
 */
function snakeToPascalFieldName(snakeCol: string): string {
  const camel = snakeCol.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
  return camelToPascal(camel);
}

/**
 * Generate a relation navigation struct field line.
 */
export function generateRelationFieldLine(
  program: Program,
  prop: ModelProperty,
  rel: ResolvedRelation,
): string {
  const fieldName = camelToPascal(prop.name);
  const doc = getDoc(program, prop);
  const docComment = buildDocComment(doc);

  // Determine Go type based on relation kind
  const isMany = rel.kind === "one-to-many" || rel.kind === "many-to-many";
  const targetType = rel.targetModel.name;

  let goType: string;
  if (isMany) {
    goType = `[]${targetType}`;
  } else if (prop.optional) {
    goType = `*${targetType}`;
  } else {
    goType = targetType;
  }

  // Build GORM tag parts
  const tagParts: string[] = [];

  // foreignKey: Convert snake_case FK column to PascalCase Go field name
  const fkFieldName = snakeToPascalFieldName(rel.fkColumnName);
  tagParts.push(`foreignKey:${fkFieldName}`);

  // Add cascade constraints
  const constraintParts: string[] = [];
  if (rel.onDelete) constraintParts.push(`OnDelete:${rel.onDelete}`);
  if (rel.onUpdate) constraintParts.push(`OnUpdate:${rel.onUpdate}`);
  if (constraintParts.length > 0) {
    tagParts.push(`constraint:${constraintParts.join(",")}`);
  }

  const gormTag = tagParts.join(";");
  const jsonOmit = prop.optional ? ",omitempty" : "";

  return `${docComment}\t${fieldName} ${goType} \`gorm:"${gormTag}" json:"${prop.name}${jsonOmit}"\``;
}
