/**
 * GormRelationField -Functions for relation struct field lines.
 *
 * Returns plain strings. Called imperatively by GormStruct.
 */

import type { Model, ModelProperty, Program } from "@typespec/compiler";
import type { ResolvedRelation } from "@qninhdt/typespec-orm";
import {
  camelToPascal,
  getDoc,
  getIndexName,
  isUnique,
  deduplicateParts,
} from "@qninhdt/typespec-orm";
import { reportDiagnostic } from "../lib.js";
import { GO_TYPE_MAP, type CompositeFieldTag } from "./GormConstants.js";

/**
 * Generate the auto-injected FK column struct field line.
 */
export function generateAutoFkFieldLine(
  program: Program,
  relationProp: ModelProperty,
  rel: ResolvedRelation,
  imports: Set<string>,
  compositeMap: Map<string, CompositeFieldTag[]>,
): string {
  const goFieldName = camelToPascal(relationProp.name + "Id");
  const columnName = rel.fkColumnName;

  const mapping = rel.fkDbType ? GO_TYPE_MAP[rel.fkDbType] : GO_TYPE_MAP["uuid"];
  const goType = mapping?.goType ?? "interface{}";
  if (mapping?.imports) {
    for (const imp of mapping.imports) imports.add(imp);
  }

  const isOpt = relationProp.optional;
  const finalGoType =
    isOpt && !goType.startsWith("*") && !goType.startsWith("[]") ? `*${goType}` : goType;

  const tagParts: string[] = [];
  tagParts.push(`column:${columnName}`);
  if (mapping?.gormType) tagParts.push(`type:${mapping.gormType}`);
  if (!isOpt) tagParts.push("not null");

  const compositeTags = compositeMap.get(columnName);

  if (isUnique(program, relationProp)) {
    tagParts.push("uniqueIndex");
  } else if (rel.autoInjectIndex) {
    const idxName = getIndexName(program, relationProp);
    tagParts.push(idxName ? `index:${idxName}` : "index");
  }

  if (compositeTags) {
    for (const ct of compositeTags) {
      tagParts.push(`${ct.kind}:${ct.name},priority:${ct.priority}`);
    }
  }

  const doc = getDoc(program, relationProp);
  if (doc) tagParts.push(`comment:${doc.replace(/;/g, ",").replace(/"/g, "'")}`);

  const gormTag = deduplicateParts(tagParts).join(";");
  const jsonName = relationProp.name + "Id";
  const jsonOmit = isOpt ? ",omitempty" : "";
  const docComment = doc ? `\t// ${doc}\n` : "";

  return `${docComment}\t${goFieldName} ${finalGoType} \`gorm:"${gormTag}" json:"${jsonName}${jsonOmit}"\`\n`;
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
  const goRefType = rel.targetModel.name;

  const gormParts: string[] = [];

  if (rel.kind === "many-to-one" || rel.kind === "one-to-one") {
    const goFkFieldName = camelToPascal(prop.name + "Id");
    gormParts.push(`foreignKey:${goFkFieldName}`);
  } else if (rel.kind === "one-to-many") {
    if (rel.inverseFkFieldName) {
      gormParts.push(`foreignKey:${rel.inverseFkFieldName}`);
    } else {
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
  }

  const constraintParts: string[] = [];
  if (rel.onDelete) constraintParts.push(`OnDelete:${rel.onDelete}`);
  if (rel.onUpdate) constraintParts.push(`OnUpdate:${rel.onUpdate}`);
  if (constraintParts.length > 0) {
    gormParts.push(`constraint:${constraintParts.join(",")}`);
  }

  const gormTag = gormParts.length > 0 ? gormParts.join(";") : "";

  const isMany = rel.kind === "one-to-many" || rel.kind === "many-to-many";
  const finalType = isMany ? `[]${goRefType}` : goRefType;
  const wrappedType = !isMany && prop.optional ? `*${finalType}` : finalType;

  const doc = getDoc(program, prop);
  const docComment = doc ? `\t// ${doc}\n` : "";

  if (gormTag) {
    return `${docComment}\t${fieldName} ${wrappedType} \`gorm:"${gormTag}" json:"${prop.name},omitempty"\`\n`;
  }
  return `${docComment}\t${fieldName} ${wrappedType} \`json:"${prop.name},omitempty"\`\n`;
}
