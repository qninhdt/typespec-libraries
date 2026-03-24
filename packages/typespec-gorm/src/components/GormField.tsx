/**
 * GormField -Functions for rendering Go struct field lines.
 *
 * Returns plain strings with proper newlines.
 * Called imperatively by GormStruct for synchronous rendering.
 */

import type { Enum, ModelProperty, Program, Type } from "@typespec/compiler";
import type { EnumMemberInfo } from "@qninhdt/typespec-orm";
import {
  getArrayElementType,
  getCheck,
  getColumnName,
  getDefaultValue,
  getDoc,
  getForeignKey,
  getIndexName,
  getUniqueName,
  getMaxLength,
  getOnDelete,
  getOnUpdate,
  getPrecision,
  getPropertyEnum,
  isArrayType,
  isAutoCreateTime,
  isAutoIncrement,
  isAutoUpdateTime,
  isKey,
  isIndex,
  isSoftDelete,
  isUnique,
  resolveDbType,
  camelToPascal,
  camelToSnake,
  deduplicateParts,
} from "@qninhdt/typespec-orm";
import { reportDiagnostic } from "../lib.js";
import type { GormEmitterOptions } from "../lib.js";
import {
  GO_TYPE_MAP,
  type CompositeFieldTag,
  escapeComment,
  buildDocComment,
} from "./GormConstants.js";
import { buildValidateTag } from "./GormValidateTag.js";

/**
 * Generate a single Go struct field line with gorm/validate/json tags.
 */
export function generateFieldLine(
  program: Program,
  prop: ModelProperty,
  compositeMap: Map<string, CompositeFieldTag[]>,
  imports: Set<string>,
  collectionStrategy?: GormEmitterOptions["collection-strategy"],
): string {
  const fieldName = camelToPascal(prop.name);
  const columnName = getColumnName(program, prop);
  if (isSoftDelete(program, prop)) {
    return generateSoftDeleteFieldLine(program, prop, fieldName, columnName, compositeMap, imports);
  }

  if (isArrayType(prop.type)) {
    const { goType, gormTag, requiredImports, doc } = resolveArrayGoType(
      program,
      prop,
      columnName,
      compositeMap,
      collectionStrategy,
    );
    for (const imp of requiredImports) imports.add(imp);

    const finalGoType = wrapOptional(goType, prop.optional);
    const docComment = buildDocComment(doc);
    const structTag = buildStructTag(program, prop, gormTag);

    return `${docComment}\t${fieldName} ${finalGoType} \`${structTag}\`\n`;
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
    const docComment = buildDocComment(doc);
    const structTag = buildStructTag(program, prop, gormTag);
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
  const docComment = buildDocComment(doc);
  const structTag = buildStructTag(program, prop, gormTag);

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
  const docComment = buildDocComment(doc);

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

function generateSoftDeleteFieldLine(
  program: Program,
  prop: ModelProperty,
  fieldName: string,
  columnName: string,
  compositeMap: Map<string, CompositeFieldTag[]>,
  imports: Set<string>,
): string {
  imports.add("gorm.io/gorm");
  const doc = getDoc(program, prop);
  const tagParts = [`column:${columnName}`, "index"];
  appendCompositeTags(tagParts, compositeMap.get(columnName));

  if (doc) {
    tagParts.push(`comment:${escapeComment(doc)}`);
  }

  return `${buildDocComment(doc)}\t${fieldName} gorm.DeletedAt \`gorm:"${tagParts.join(";")}" json:"${prop.name}"\`\n`;
}

function buildStructTag(program: Program, prop: ModelProperty, gormTag: string): string {
  const validateTag = buildValidateTag(program, prop);
  const jsonOmit = prop.optional ? ",omitempty" : "";
  const jsonTag = `json:"${prop.name}${jsonOmit}"`;
  return validateTag
    ? `gorm:"${gormTag}" validate:"${validateTag}" ${jsonTag}`
    : `gorm:"${gormTag}" ${jsonTag}`;
}

function appendCompositeTags(
  tagParts: string[],
  compositeTags: CompositeFieldTag[] | undefined,
): void {
  if (!compositeTags) {
    return;
  }

  for (const ct of compositeTags) {
    tagParts.push(`${ct.kind}:${ct.name},priority:${ct.priority}`);
  }
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

  if (isKey(program, prop)) {
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
  if (doc) tagParts.push(`comment:${escapeComment(doc)}`);

  const fk = getForeignKey(program, prop);
  if (fk) {
    if (needsForeignKeyIndex(program, prop, compositeMap.get(columnName))) {
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

function needsForeignKeyIndex(
  program: Program,
  prop: ModelProperty,
  compositeTags: CompositeFieldTag[] | undefined,
): boolean {
  if (isIndex(program, prop)) {
    return false;
  }

  return !compositeTags?.some((ct) => ct.kind === "index" || ct.kind === "primaryIndex");
}

function resolveArrayGoType(
  program: Program,
  prop: ModelProperty,
  columnName: string,
  compositeMap: Map<string, CompositeFieldTag[]>,
  collectionStrategy?: GormEmitterOptions["collection-strategy"],
): GoTypeResult {
  const elementType = getArrayElementType(prop.type);
  const { elementGoType, postgresElementType, requiredImports } = resolveArrayElementType(
    program,
    prop,
    elementType,
  );

  let goType = "[]interface{}";
  let gormTypeName = "";

  if (!collectionStrategy) {
    reportDiagnostic(program, {
      code: "unsupported-type",
      format: { typeName: "array", propName: prop.name },
      target: prop,
    });
  } else if (!elementGoType) {
    // `resolveArrayElementType` already reported a concrete diagnostic.
  } else if (collectionStrategy === "jsonb") {
    goType = `datatypes.JSONSlice[${elementGoType}]`;
    gormTypeName = "jsonb";
    requiredImports.push("gorm.io/datatypes");
  } else if (postgresElementType) {
    goType = `[]${elementGoType}`;
    gormTypeName = `${postgresElementType}[]`;
  } else {
    reportDiagnostic(program, {
      code: "unsupported-type",
      format: {
        typeName: elementType ? describeTypeForDiagnostic(program, elementType) : "array",
        propName: prop.name,
      },
      target: prop,
    });
  }

  const tagParts: string[] = [`column:${columnName}`];
  if (gormTypeName) {
    tagParts.push(`type:${gormTypeName}`);
  }

  appendCommonGormTags(program, prop, columnName, compositeMap, tagParts);

  const doc = getDoc(program, prop);
  if (doc) tagParts.push(`comment:${escapeComment(doc)}`);

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
  if (doc) tagParts.push(`comment:${escapeComment(doc)}`);

  return {
    goType,
    gormTag: deduplicateParts(tagParts).join(";"),
    requiredImports: [],
    doc,
  };
}

function resolveArrayElementType(
  program: Program,
  prop: ModelProperty,
  elementType: Type | undefined,
): { elementGoType?: string; postgresElementType?: string; requiredImports: string[] } {
  if (!elementType) {
    reportDiagnostic(program, {
      code: "unsupported-type",
      format: { typeName: "array", propName: prop.name },
      target: prop,
    });
    return { requiredImports: [] };
  }

  if (elementType.kind === "Enum") {
    return {
      elementGoType: camelToPascal(elementType.name),
      postgresElementType: camelToSnake(elementType.name),
      requiredImports: [],
    };
  }

  const dbType = resolveDbType(elementType);
  const mapping = dbType ? GO_TYPE_MAP[dbType] : undefined;
  if (!dbType || !mapping) {
    reportDiagnostic(program, {
      code: "unsupported-type",
      format: {
        typeName: dbType ?? describeTypeForDiagnostic(program, elementType),
        propName: prop.name,
      },
      target: prop,
    });
    return { requiredImports: [] };
  }

  return {
    elementGoType: mapping.goType,
    postgresElementType: resolvePostgresArrayElementType(dbType),
    requiredImports: mapping.imports ? [...mapping.imports] : [],
  };
}

function resolvePostgresArrayElementType(dbType: string): string | undefined {
  switch (dbType) {
    case "string":
    case "text":
      return "text";
    case "uuid":
      return "uuid";
    case "boolean":
      return "boolean";
    case "int8":
    case "int16":
    case "int32":
    case "serial":
      return "integer";
    case "int64":
    case "bigserial":
      return "bigint";
    case "uint8":
    case "uint16":
    case "uint32":
    case "uint64":
      return "bigint";
    case "float32":
      return "real";
    case "float64":
      return "double precision";
    case "decimal":
      return "numeric";
    case "date":
      return "date";
    case "time":
      return "time";
    case "utcDateTime":
      return "timestamptz";
    default:
      return undefined;
  }
}

function describeTypeForDiagnostic(_program: Program, type: Type): string {
  if (type.kind === "ModelProperty") {
    return describeTypeForDiagnostic(_program, type.type);
  }
  if ("name" in type && typeof type.name === "string") {
    return type.name;
  }
  return type.kind;
}

function appendCommonGormTags(
  program: Program,
  prop: ModelProperty,
  columnName: string,
  compositeMap: Map<string, CompositeFieldTag[]>,
  tagParts: string[],
): void {
  if (!prop.optional && !isKey(program, prop)) tagParts.push("not null");

  // Check if this field is part of a composite constraint
  const compositeTags = compositeMap.get(columnName);
  const isPartOfCompositeUnique = compositeTags?.some((ct) => ct.kind === "uniqueIndex");

  // Only add standalone uniqueIndex if NOT part of a composite unique
  if (isUnique(program, prop) && !isPartOfCompositeUnique) {
    const uniqName = getUniqueName(program, prop);
    tagParts.push(`uniqueIndex:${uniqName}`);
  }

  if (isIndex(program, prop)) {
    const idxName = getIndexName(program, prop);
    tagParts.push(`index:${idxName}`);
  }

  // compositeMap uses snake_case keys (matching database column names)
  if (compositeTags) {
    for (const ct of compositeTags) {
      tagParts.push(`${ct.kind}:${ct.name},priority:${ct.priority}`);
    }
  }

  if (!isKey(program, prop)) {
    const defaultVal = getDefaultValue(program, prop);
    if (defaultVal) tagParts.push(`default:${defaultVal}`);
  }

  const check = getCheck(program, prop);
  if (check) {
    tagParts.push(`check:${check.name},${check.expression}`);
  }
}
