/**
 * Barrel re-export module for the typespec-orm helpers.
 *
 * Historical entry point: emitters and internal modules import everything via
 * `@qninhdt/typespec-orm` (which forwards from this file). The implementation
 * has been split across smaller modules; this file simply re-exports the
 * public surface so existing import paths continue to work.
 */

export {
  // Naming utilities
  camelToSnake,
  camelToPascal,
  deriveTableName,
} from "./naming.js";

export {
  // Scalar resolution
  DB_SCALARS,
  STANDARD_SCALAR_MAP,
  getScalarChain,
  resolveDbType,
  withLookupFallback,
  scalarChainFallback,
  getOrmScalarName,
  getCustomScalarName,
} from "./scalar-resolution.js";

export {
  // Namespace / type-name helpers
  getNamespaceSegments,
  getNamespaceFullName,
  getTypeFullName,
  isBuiltIn,
  isCustomScalar,
  collectCustomScalars,
  // Table / property accessors
  isTable,
  isTableMixin,
  isOrmManagedModel,
  getTableName,
  getColumnName,
  isIndex,
  getIndexName,
  isUnique,
  getUniqueName,
  getCheck,
  getDefaultValue,
  isAutoIncrement,
  isSoftDelete,
  isKey,
  isArrayType,
  getArrayElementType,
  // Validator accessors
  getMaxValueExclusive,
  getMinValueExclusive,
  getMaxItems,
  getMinItems,
  getMaxLength,
  getMinLength,
  getMinValue,
  getMaxValue,
  getPattern,
  getValidators,
  // Foreign key
  getForeignKeyConfig,
  getForeignKey,
  getForeignKeyTarget,
  getMappedBy,
  getManyToMany,
  // Composite
  getCompositeFields,
  // Timestamps / precision / cascading
  isAutoCreateTime,
  isAutoUpdateTime,
  getPrecision,
  getOnDelete,
  getOnUpdate,
  // Schema / version / audit / tenant
  getSchemaName,
  getDefaultExpression,
  isVersionColumn,
  getAuditRole,
  isTenantIdColumn,
  findVersionProperty,
  findTenantIdProperty,
  // Catalog metadata
  getTags,
  hasTag,
  getOwner,
  getClassification,
  // Ignore
  isIgnored,
  // Data / form
  isData,
  getDataLabel,
  getTitle,
  getPlaceholder,
  getInputType,
  getModelOwnProperties,
  getDoc,
  // Enum
  isEnum,
  getEnumMembers,
  getPropertyEnum,
} from "./state-accessors.js";

export type {
  CheckConstraintInfo,
  ValidatorInfo,
  ForeignKeyConfig,
  PrecisionInfo,
  EnumMemberInfo,
} from "./state-accessors.js";

export {
  // Collectors
  collectTableModels,
  collectTableMixins,
  collectOrmManagedModels,
} from "./collectors.js";

export type { TableModel } from "./collectors.js";

export {
  // Relations
  findPrimaryKey,
  unwrapArrayType,
  resolvePropertyReference,
  resolvePropertyByName,
  describeComparableType,
  arePropertyTypesCompatible,
  isRelationLocalKeyUnique,
  findInverseMappedBy,
  deriveManyToManyJoinColumnName,
  collectManyToManyAssociations,
  resolveRelation,
  resolveMappedByTarget,
} from "./relations.js";

export type { ResolvedRelation, ManyToManyAssociation } from "./relations.js";

// ─── Higher-level helpers that span multiple modules ───────────────────────

import type { Model, Program, ModelProperty, Scalar } from "@typespec/compiler";
import { getCustomScalarName } from "./scalar-resolution.js";
import {
  getInputType,
  getTypeFullName,
  isData,
  getDataLabel,
} from "./state-accessors.js";
import { collectOrmManagedModels } from "./collectors.js";

export function collectDataModels(program: Program): { model: Model; label: string }[] {
  return collectOrmManagedModels(program)
    .filter((model) => isData(program, model))
    .map((model) => ({ model, label: getDataLabel(program, model) ?? model.name }))
    .sort((a, b) =>
      getTypeFullName(program, a.model).localeCompare(getTypeFullName(program, b.model)),
    );
}

function getInputTypeForScalar(program: Program, scalar: Scalar): string | undefined {
  let current: Scalar | undefined = scalar;
  while (current) {
    const inputType = getInputType(program, current);
    if (inputType) {
      return inputType;
    }
    current = current.baseScalar;
  }
  return undefined;
}

function inferInputTypeFromCustomScalar(customScalarName: string | undefined): string | undefined {
  switch (customScalarName) {
    case "email":
      return "email";
    case "url":
      return "url";
    default:
      return undefined;
  }
}

export function getInputTypeForProperty(program: Program, prop: ModelProperty): string | undefined {
  if (prop.type.kind === "ModelProperty") {
    return getInputTypeForProperty(program, prop.type);
  }

  if (prop.type.kind === "Scalar") {
    const inputType = getInputTypeForScalar(program, prop.type);
    if (inputType) {
      return inputType;
    }
  }

  return inferInputTypeFromCustomScalar(getCustomScalarName(prop.type));
}
