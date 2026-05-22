/**
 * PyField — orchestrator for generating SQLModel field definitions.
 *
 * Returns plain strings. Called imperatively by PyModel. Heavy lifting lives in
 * `py-field-builders.ts` (regular fields), `py-field-array.ts`, and
 * `py-field-enum.ts`.
 */

import type { Enum, ModelProperty, Program, Scalar } from "@typespec/compiler";
import type { EnumMemberInfo } from "@qninhdt/typespec-orm";
import {
  camelToSnake,
  getColumnName,
  getCompositeFields,
  getDoc,
  getOrmScalarName,
  getPrecision,
  getPropertyEnum,
  isArrayType,
  isAutoIncrement,
  isCustomScalar,
  isKey,
  isSoftDelete,
  resolveDbType,
} from "@qninhdt/typespec-orm";
import { reportDiagnostic } from "../lib.js";
import type { SqlModelEmitterOptions } from "../lib.js";
import { FOUR_SPACES, getNativePydanticType, getPythonTypeMap } from "./PyConstants.js";
import {
  buildConstraintArgs,
  buildFkArgs,
  buildMetadataArgs,
  buildPkArgs,
  buildSoftDeleteIndex,
  finalizeColumn,
  type FieldArgState,
  type FieldFlags,
  type FieldImports,
  type ResolvedForeignKeyFieldInfo,
} from "./py-field-builders.js";
import { generateArrayField } from "./py-field-array.js";
import { generateEnumField } from "./py-field-enum.js";
import { getEffectivePropertyConstraints } from "./py-property-constraints.js";

export type { ResolvedForeignKeyFieldInfo } from "./py-field-builders.js";

/**
 * Generate a regular SQLModel field line.
 */
export function generateField(
  program: Program,
  prop: ModelProperty,
  stdImports: Set<string>,
  saImports: Set<string>,
  sqlmodelImports: Set<string>,
  needsField: { value: boolean },
  needsColumn: { value: boolean },
  isPartOfCompositeUnique?: boolean,
  relationForeignKey?: ResolvedForeignKeyFieldInfo,
  collectionStrategy?: SqlModelEmitterOptions["collection-strategy"],
  scalarAliasNames?: ReadonlyMap<Scalar, string>,
): string {
  if (getCompositeFields(program, prop)) return "";

  const columnName = getColumnName(program, prop);
  const pyFieldName = columnName;

  if (isArrayType(prop.type)) {
    return generateArrayField(
      program,
      prop,
      pyFieldName,
      stdImports,
      saImports,
      needsField,
      needsColumn,
      collectionStrategy,
    );
  }

  const dbType = resolveDbType(prop.type);
  const enumInfo = getPropertyEnum(prop);
  if (enumInfo) {
    return generateEnumField(
      program,
      prop,
      pyFieldName,
      enumInfo,
      saImports,
      needsField,
      needsColumn,
      isPartOfCompositeUnique,
    );
  }

  const mapping = dbType ? getPythonTypeMap(dbType) : getPythonTypeMap("unknown");
  for (const imp of mapping.imports) stdImports.add(imp);

  let pyType = mapping.pyType;
  const isOptional = prop.optional;
  const isPk = isKey(program, prop);
  const isSoft = isSoftDelete(program, prop);
  const isAutoInc = isAutoIncrement(program, prop) || dbType === "serial" || dbType === "bigserial";

  // Custom scalar overrides — choose between native pydantic types and
  // generated alias names.
  let usesScalarAlias = false;
  let usesNativeScalar = false;
  if (prop.type.kind === "Scalar" && isCustomScalar(program, prop.type)) {
    const semanticScalarName = getOrmScalarName(prop.type) ?? prop.type.name;
    const nativeType = getNativePydanticType(semanticScalarName);
    if (nativeType) {
      stdImports.add(`pydantic.${nativeType}`);
      pyType = nativeType;
      usesNativeScalar = true;
    } else {
      pyType = scalarAliasNames?.get(prop.type) ?? prop.type.name;
      usesScalarAlias = true;
    }
  }

  const constraints = getEffectivePropertyConstraints(program, prop, {
    useDirect: usesScalarAlias || usesNativeScalar,
  });

  if (isOptional || isSoft) pyType = `${pyType} | None`;

  // Diagnose unmapped types after custom-scalar resolution.
  if (!dbType && !usesScalarAlias && !usesNativeScalar) {
    reportDiagnostic(program, {
      code: "unsupported-type",
      format: { typeName: prop.type.kind, propName: prop.name },
      target: prop,
    });
  }

  const state: FieldArgState = { fieldArgs: [], columnArgs: [] };
  const imports: FieldImports = { std: stdImports, sa: saImports };
  const flags: FieldFlags = { needsField, needsColumn };

  buildPkArgs(program, prop, dbType, state, imports, flags);
  buildConstraintArgs({
    program,
    prop,
    dbType,
    isPk,
    isOptional,
    isSoft,
    isAutoInc,
    isPartOfCompositeUnique: isPartOfCompositeUnique ?? false,
    hasRelationFk: !!relationForeignKey,
    constraints,
    usesScalarAlias,
    usesNativeScalar,
    state,
    imports,
    flags,
  });

  // Precision override for numeric types.
  let overrideSaColumnType: string | undefined;
  const prec = getPrecision(program, prop);
  if (prec && (dbType === "decimal" || dbType === "float32" || dbType === "float64")) {
    overrideSaColumnType = `Numeric(${prec.precision}, ${prec.scale})`;
    saImports.add("sqlalchemy.Numeric");
  }

  buildFkArgs({ program, prop, relationForeignKey, state, imports, flags });
  buildSoftDeleteIndex(program, prop, state, flags);
  buildMetadataArgs(program, prop, state, flags);

  // Reference sqlmodelImports so the parameter is intentionally retained for
  // future use (Field/Relationship are added by the caller).
  void sqlmodelImports;

  return finalizeColumn({
    prop,
    pyFieldName,
    pyType,
    dbType,
    mapping,
    isPk,
    overrideSaColumnType,
    doc: getDoc(program, prop),
    state,
    imports,
    flags,
  });
}

/**
 * Generate an ignored field (ClassVar).
 */
export function generateIgnoredField(
  program: Program,
  prop: ModelProperty,
  stdImports: Set<string>,
  enumInfo?: { enumType: Enum; members: EnumMemberInfo[] } | null,
): string {
  const dbType = resolveDbType(prop.type);
  const mapping = dbType ? getPythonTypeMap(dbType) : getPythonTypeMap("unknown");
  let pyType = mapping.pyType;
  if (enumInfo) {
    pyType = enumInfo.enumType.name;
  } else {
    for (const imp of mapping.imports) stdImports.add(imp);
  }
  stdImports.add("typing.ClassVar");
  const finalType = prop.optional ? `${pyType} | None` : pyType;
  const doc = getDoc(program, prop);
  const docComment = doc ? `${FOUR_SPACES}# ${doc}\n` : "";
  return `${docComment}${FOUR_SPACES}${camelToSnake(prop.name)}: ClassVar[${finalType}]  # @ignore - not persisted\n`;
}
