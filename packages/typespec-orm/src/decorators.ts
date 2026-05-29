export {
  $table,
  $tableMixin,
  $schema,
  $scope,
  $tableIndex,
  $tableUnique,
  $refine,
  $entity,
} from "./decorators-table.js";

export type { ModelIndexSpec, RefineSpec } from "./decorators-table.js";

export {
  $map,
  $index,
  $unique,
  $check,
  $autoIncrement,
  $autoCreateTime,
  $autoUpdateTime,
  $precision,
  $ignore,
  $defaultExpression,
  $version,
  $indexUsing,
  $partialIndex,
  $goType,
  $noDefault,
} from "./decorators-column.js";

export type { GoTypeSpec } from "./decorators-column.js";

export {
  $foreignKey,
  $mappedBy,
  $manyToMany,
  $manyToManyOwner,
  $onDelete,
  $onUpdate,
  $polymorphic,
} from "./decorators-relations.js";

export type { PolymorphicConfig } from "./decorators-relations.js";

export { $title, $placeholder, $inputType } from "./decorators-form.js";
