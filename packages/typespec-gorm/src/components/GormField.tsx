/**
 * GormField -Functions for rendering Go struct field lines.
 *
 * Returns plain strings with proper newlines.
 * Called imperatively by GormStruct for synchronous rendering.
 */

import type { Enum, ModelProperty, Program } from "@typespec/compiler";
import type { EnumMemberInfo } from "@qninhdt/typespec-orm";
import {
  getColumnName,
  getDefaultValue,
  getDoc,
  getForeignKey,
  getIndexName,
  getMaxLength,
  getOnDelete,
  getOnUpdate,
  getPrecision,
  getPropertyEnum,
  isAutoCreateTime,
  isAutoIncrement,
  isAutoUpdateTime,
  isId,
  isIndex,
  isSoftDelete,
  isUnique,
  resolveDbType,
  camelToPascal,
  deduplicateParts,
} from "@qninhdt/typespec-orm";
import { reportDiagnostic } from "../lib.js";
import { GO_TYPE_MAP, type CompositeFieldTag } from "./GormConstants.js";
import { buildValidateTag } from "./GormValidateTag.js";

/**
 * Generate a single Go struct field line with gorm/validate/json tags.
 */
export function generateFieldLine(
  program: Program,
  prop: ModelProperty,
  compositeMap: Map<string, CompositeFieldTag[]>,
  imports: Set<string>,
): string {
  const fieldName = camelToPascal(prop.name);
  const columnName = getColumnName(program, prop);
  const isSoft = isSoftDelete(program, prop);

  // Soft delete gets special GORM type
  if (isSoft) {
    imports.add("gorm.io/gorm");
    const gormTag = `column:${columnName};index`;
    return `\t${fieldName} gorm.DeletedAt \`gorm:"${gormTag}" json:"${prop.name}"\`\n`;
  }

  // Enum check
  const enumInfo = getPropertyEnum(prop);
  if (enumInfo) {
    const { goType, gormTag, doc } = resolveEnumGoType(
      program,
      prop,
      columnName,
      enumInfo,
      compositeMap,
    );
    const isOpt = prop.optional;
    const finalGoType = wrapOptional(goType, isOpt);
    const validateTag = buildValidateTag(program, prop);
    const jsonOmit = isOpt ? ",omitempty" : "";
    const docComment = doc ? `\t// ${doc}\n` : "";
    const structTag = validateTag
      ? `gorm:"${gormTag}" validate:"${validateTag}" json:"${prop.name}${jsonOmit}"`
      : `gorm:"${gormTag}" json:"${prop.name}${jsonOmit}"`;
    return `${docComment}\t${fieldName} ${finalGoType} \`${structTag}\`\n`;
  }

  // Regular scalar type
  const { goType, gormTag, requiredImports, doc } = resolveGoType(
    program,
    prop,
    columnName,
    compositeMap,
  );
  for (const imp of requiredImports) imports.add(imp);

  const isOpt = prop.optional;
  const finalGoType = wrapOptional(goType, isOpt);
  const validateTag = buildValidateTag(program, prop);
  const jsonOmit = isOpt ? ",omitempty" : "";
  const docComment = doc ? `\t// ${doc}\n` : "";
  const structTag = validateTag
    ? `gorm:"${gormTag}" validate:"${validateTag}" json:"${prop.name}${jsonOmit}"`
    : `gorm:"${gormTag}" json:"${prop.name}${jsonOmit}"`;

  return `${docComment}\t${fieldName} ${finalGoType} \`${structTag}\`\n`;
}

/**
 * Generate an ignored field (gorm:"-") line.
 */
export function generateIgnoredFieldLine(
  program: Program,
  prop: ModelProperty,
  imports: Set<string>,
  goType: string,
): string {
  const fieldName = camelToPascal(prop.name);
  const finalGoType = wrapOptional(goType, prop.optional);
  const jsonOmit = prop.optional ? ",omitempty" : "";
  const doc = getDoc(program, prop);
  const docComment = doc ? `\t// ${doc}\n` : "";

  return `${docComment}\t${fieldName} ${finalGoType} \`gorm:"-" json:"${prop.name}${jsonOmit}"\`\n`;
}

// ─── Internal helpers ───────────────────────────────────────────────────────

function wrapOptional(goType: string, isOpt: boolean): string {
  return isOpt && !goType.startsWith("*") && !goType.startsWith("[]") ? `*${goType}` : goType;
}

interface GoTypeResult {
  goType: string;
  gormTag: string;
  requiredImports: string[];
  doc: string | undefined;
}

function resolveGoType(
  program: Program,
  prop: ModelProperty,
  columnName: string,
  compositeMap: Map<string, CompositeFieldTag[]>,
): GoTypeResult {
  const dbType = resolveDbType(prop.type);
  const mapping = dbType ? GO_TYPE_MAP[dbType] : undefined;

  if (!mapping) {
    reportDiagnostic(program, {
      code: "unsupported-type",
      format: { typeName: dbType ?? prop.type.kind, propName: prop.name },
      target: prop,
    });
  }

  const goType = mapping?.goType ?? "interface{}";
  const requiredImports = mapping?.imports ? [...mapping.imports] : [];

  const tagParts: string[] = [];
  tagParts.push(`column:${columnName}`);

  let gormTypeName = mapping?.gormType ?? "";
  const maxLen = getMaxLength(program, prop);
  if (maxLen !== undefined && (dbType === "string" || gormTypeName === "varchar(255)")) {
    gormTypeName = `varchar(${maxLen})`;
  }
  const prec = getPrecision(program, prop);
  if (prec && (dbType === "decimal" || dbType === "float64")) {
    gormTypeName = `numeric(${prec.precision},${prec.scale})`;
  }
  if (gormTypeName) tagParts.push(`type:${gormTypeName}`);

  if (isId(program, prop)) {
    tagParts.push("primaryKey");
    if (dbType === "uuid") {
      const customDefault = getDefaultValue(program, prop);
      tagParts.push(`default:${customDefault ?? "gen_random_uuid()"}`);
    }
  }

  if (isAutoIncrement(program, prop) || dbType === "serial" || dbType === "bigserial") {
    tagParts.push("autoIncrement");
  }
  if (isAutoCreateTime(program, prop)) tagParts.push("autoCreateTime");
  if (isAutoUpdateTime(program, prop)) tagParts.push("autoUpdateTime");

  appendCommonGormTags(program, prop, columnName, compositeMap, tagParts);

  const doc = getDoc(program, prop);
  if (doc) tagParts.push(`comment:${doc.replace(/;/g, ",").replace(/"/g, "'")}`);

  const fk = getForeignKey(program, prop);
  if (fk) {
    const compositeTags = compositeMap.get(columnName);
    if (!isIndex(program, prop) && !compositeTags?.some((ct) => ct.kind === "index")) {
      tagParts.push("index");
    }
    const onDel = getOnDelete(program, prop);
    const onUpd = getOnUpdate(program, prop);
    const constraintParts: string[] = [];
    if (onDel) constraintParts.push(`OnDelete:${onDel}`);
    if (onUpd) constraintParts.push(`OnUpdate:${onUpd}`);
    if (constraintParts.length > 0) {
      tagParts.push(`constraint:${constraintParts.join(",")}`);
    }
  }

  return {
    goType,
    gormTag: deduplicateParts(tagParts).join(";"),
    requiredImports,
    doc,
  };
}

function resolveEnumGoType(
  program: Program,
  prop: ModelProperty,
  columnName: string,
  enumInfo: { enumType: Enum; members: EnumMemberInfo[] },
  compositeMap: Map<string, CompositeFieldTag[]>,
): GoTypeResult {
  const goType = camelToPascal(enumInfo.enumType.name);
  const maxValueLen = Math.max(...enumInfo.members.map((m) => m.value.length), 20);
  const gormTypeName = `varchar(${maxValueLen})`;

  const tagParts: string[] = [];
  tagParts.push(`column:${columnName}`);
  tagParts.push(`type:${gormTypeName}`);

  appendCommonGormTags(program, prop, columnName, compositeMap, tagParts);

  const doc = getDoc(program, prop);
  if (doc) tagParts.push(`comment:${doc.replace(/;/g, ",").replace(/"/g, "'")}`);

  return {
    goType,
    gormTag: deduplicateParts(tagParts).join(";"),
    requiredImports: [],
    doc,
  };
}

function appendCommonGormTags(
  program: Program,
  prop: ModelProperty,
  columnName: string,
  compositeMap: Map<string, CompositeFieldTag[]>,
  tagParts: string[],
): void {
  if (!prop.optional && !isId(program, prop)) tagParts.push("not null");
  if (isUnique(program, prop)) tagParts.push("uniqueIndex");
  if (isIndex(program, prop)) {
    const idxName = getIndexName(program, prop);
    tagParts.push(idxName ? `index:${idxName}` : "index");
  }
  const compositeTags = compositeMap.get(columnName);
  if (compositeTags) {
    for (const ct of compositeTags) {
      tagParts.push(`${ct.kind}:${ct.name},priority:${ct.priority}`);
    }
  }
  if (!isId(program, prop)) {
    const defaultVal = getDefaultValue(program, prop);
    if (defaultVal) tagParts.push(`default:${defaultVal}`);
  }
}
