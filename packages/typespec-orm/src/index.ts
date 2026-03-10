// Re-export library and state keys for consumers (emitters)
export { $lib } from "./lib.js";
export {
  TableKey,
  IdKey,
  MapKey,
  IndexKey,
  UniqueKey,
  AutoIncrementKey,
  SoftDeleteKey,
  ForeignKeyKey,
  RelationKey,
  CompositeIndexKey,
  CompositeUniqueKey,
  AutoCreateTimeKey,
  AutoUpdateTimeKey,
  PrecisionKey,
  OnDeleteKey,
  OnUpdateKey,
  IgnoreKey,
  DataKey,
  TitleKey,
  PlaceholderKey,
  InputTypeKey,
  reportDiagnostic,
} from "./lib.js";

// ─── Validation hook ─────────────────────────────────────────────────────────
// Called by the TypeSpec compiler after all decorators are applied.

export { $onValidate } from "./validators.js";

// ─── Decorator namespace registration ────────────────────────────────────────
// TypeSpec resolves extern dec implementations via the $decorators export map.
// Individual $name functions must NOT be re-exported as top-level named exports
// to avoid "duplicate-symbol" errors with the extern dec declarations in the .tsp file.

import {
  $table,
  $id,
  $map,
  $index,
  $unique,
  $autoIncrement,
  $softDelete,
  $foreignKey,
  $relation,
  $compositeIndex,
  $compositeUnique,
  $autoCreateTime,
  $autoUpdateTime,
  $precision,
  $onDelete,
  $onUpdate,
  $ignore,
  $data,
  $title,
  $placeholder,
  $inputType,
} from "./decorators.js";

export const $decorators = {
  "Qninhdt.Orm": {
    table: $table,
    id: $id,
    map: $map,
    index: $index,
    unique: $unique,
    autoIncrement: $autoIncrement,
    softDelete: $softDelete,
    foreignKey: $foreignKey,
    relation: $relation,
    compositeIndex: $compositeIndex,
    compositeUnique: $compositeUnique,
    autoCreateTime: $autoCreateTime,
    autoUpdateTime: $autoUpdateTime,
    precision: $precision,
    onDelete: $onDelete,
    onUpdate: $onUpdate,
    ignore: $ignore,
    data: $data,
    title: $title,
    placeholder: $placeholder,
    inputType: $inputType,
  },
};

// Helper functions for emitters to read decorator state
export {
  isTable,
  getTableName,
  isId,
  getColumnName,
  isIndex,
  getIndexName,
  isUnique,
  getDefaultValue,
  isAutoIncrement,
  isSoftDelete,
  getMaxLength,
  getMinLength,
  getMinValue,
  getMaxValue,
  getPattern,
  getFormat,
  getDoc,
  getForeignKey,
  getRelation,
  getCompositeIndexes,
  getCompositeUniques,
  isAutoCreateTime,
  isAutoUpdateTime,
  getPrecision,
  getOnDelete,
  getOnUpdate,
  isIgnored,
  isEnum,
  getEnumMembers,
  getPropertyEnum,
  getScalarChain,
  resolveDbType,
  camelToSnake,
  camelToPascal,
  deriveTableName,
  collectTableModels,
  // Auto-relation detection
  findPrimaryKey,
  unwrapArrayType,
  resolveRelation,
  // Data / form helpers
  isData,
  getDataLabel,
  getTitle,
  collectDataModels,
  getPlaceholder,
  getInputType,
} from "./helpers.js";

export type {
  ForeignKeyInfo,
  RelationInfo,
  ResolvedRelation,
  CompositeConstraint,
  PrecisionInfo,
  EnumMemberInfo,
  TableModel,
} from "./helpers.js";

// ─── Shared emitter utilities ────────────────────────────────────────────────
export { NUMERIC_TYPES, deduplicateParts, classifyProperties } from "./emitter-utils.js";

export type {
  ClassifiedProperty,
  ClassifiedRelation,
  ClassifiedProperties,
} from "./emitter-utils.js";
