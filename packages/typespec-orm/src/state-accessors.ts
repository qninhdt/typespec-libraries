export {
  getNamespaceSegments,
  getNamespaceFullName,
  getTypeFullName,
  isBuiltIn,
  isCustomScalar,
  collectCustomScalars,
  isArrayType,
  getArrayElementType,
  getModelOwnProperties,
  getDoc,
  isEnum,
  getEnumMembers,
  getPropertyEnum,
} from "./state-types.js";

export type { EnumMemberInfo } from "./state-types.js";

export {
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
  isIgnored,
} from "./state-columns.js";

export type { CheckConstraintInfo } from "./state-columns.js";

export {
  isKey,
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
  isAutoCreateTime,
  isAutoUpdateTime,
  getPrecision,
} from "./state-validators.js";

export type { ValidatorInfo, PrecisionInfo } from "./state-validators.js";

export {
  getForeignKeyConfig,
  getForeignKey,
  getForeignKeyTarget,
  getMappedBy,
  getManyToMany,
  isManyToManyOwner,
  getOnDelete,
  getOnUpdate,
  getSchemaName,
  getDefaultExpression,
  isVersionColumn,
  findVersionProperty,
  getPolymorphicConfig,
  isPolymorphicProperty,
  getIndexUsing,
  getPartialIndex,
  getGoType,
  getRefines,
} from "./state-relations.js";

export type {
  ForeignKeyConfig,
  PolymorphicConfig,
  IndexMethod,
  GoTypeSpec,
  RefineSpec,
} from "./state-relations.js";

export {
  getScopes,
  hasScope,
  isData,
  getTitle,
  getPlaceholder,
  getInputType,
  getCompositeFields,
} from "./state-catalog.js";
