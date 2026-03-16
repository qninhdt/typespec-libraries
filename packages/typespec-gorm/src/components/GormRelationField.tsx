/**
 * GormRelationField - Functions for relation struct field lines.
 *
 * Returns plain strings. Called imperatively by GormStruct.
 */

import type { ModelProperty, Program } from "@typespec/compiler";
import type { ResolvedRelation } from "@qninhdt/typespec-orm";
import { camelToPascal, getDoc } from "@qninhdt/typespec-orm";

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
  const docComment = doc ? `\t// ${doc}\n` : "";

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

  // foreignKey: Convert snake_case to PascalCase (e.g., user_id → UserID, world_id → OwnerID)
  // First convert to camelCase, then capitalize first letter
  let fkFieldName = rel.fkColumnName.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
  // Then capitalize first letter
  fkFieldName = fkFieldName.charAt(0).toUpperCase() + fkFieldName.slice(1);
  // Handle special case: field ending with _id should be _ID (e.g., user_id → UserID)
  fkFieldName = fkFieldName.replace(/Id$/, "ID");
  tagParts.push(`foreignKey:${fkFieldName}`);

  // Add cascade delete in constraint: format (comma-separated)
  const constraintParts: string[] = [];
  if (rel.onDelete) {
    constraintParts.push(`OnDelete:${rel.onDelete}`);
  }
  if (rel.onUpdate) {
    constraintParts.push(`OnUpdate:${rel.onUpdate}`);
  }
  if (constraintParts.length > 0) {
    tagParts.push(`constraint:${constraintParts.join(",")}`);
  }

  const gormTag = tagParts.join(";");
  const jsonName = prop.name;
  const jsonOmit = prop.optional ? ",omitempty" : "";

  return `${docComment}\t${fieldName} ${goType} \`gorm:"${gormTag}" json:"${jsonName}${jsonOmit}"\``;
}
