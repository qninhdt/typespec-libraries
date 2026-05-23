export {
  $table,
  $tableMixin,
  $schema,
  $scope,
  $owner,
  $classification,
  $tableIndex,
  $tableUnique,
  $refine,
} from "./decorators-table.js";

export type { ModelIndexSpec, RefineSpec } from "./decorators-table.js";

export {
  $map,
  $index,
  $unique,
  $check,
  $autoIncrement,
  $softDelete,
  $autoCreateTime,
  $autoUpdateTime,
  $precision,
  $ignore,
  $defaultExpression,
  $version,
  $audit,
  $tenantId,
  $indexUsing,
  $goType,
} from "./decorators-column.js";

export type { GoTypeSpec } from "./decorators-column.js";

export {
  $foreignKey,
  $mappedBy,
  $manyToMany,
  $onDelete,
  $onUpdate,
  $polymorphic,
} from "./decorators-relations.js";

export type { PolymorphicConfig } from "./decorators-relations.js";

export { $title, $placeholder, $inputType } from "./decorators-form.js";
