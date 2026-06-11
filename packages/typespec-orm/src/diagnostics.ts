import { paramMessage } from "@typespec/compiler";

export const diagnostics = {
  // ─── Errors ────────────────────────────────────────────────────────────────

  "multiple-keys": {
    severity: "error",
    messages: {
      default: `Model has multiple @key properties. Only one primary key is allowed per table.`,
    },
  },
  "multiple-version-columns": {
    severity: "error",
    messages: {
      default: `Model has multiple @version properties. Only one optimistic-locking column is allowed per table.`,
    },
  },
  "duplicate-table-name": {
    severity: "error",
    messages: {
      default: paramMessage`Table name "${"tableName"}" is already used by model "${"existingModel"}". Each @table model must have a unique table name.`,
    },
  },
  "duplicate-column-name": {
    severity: "error",
    messages: {
      default: paramMessage`Column "${"columnName"}" is produced by both "${"prop1"}" and "${"prop2"}". Use @map to distinguish them.`,
    },
  },
  "namespace-required": {
    severity: "error",
    messages: {
      default: paramMessage`${"kind"} "${"typeName"}" must be declared inside a namespace.`,
    },
  },
  "mixin-cycle": {
    severity: "error",
    messages: {
      default: paramMessage`@tableMixin "${"typeName"}" forms a cycle through "${"chain"}".`,
    },
  },
  "mixin-field-conflict": {
    severity: "error",
    messages: {
      default: paramMessage`Field "${"fieldName"}" from "${"incomingSource"}" conflicts with "${"existingSource"}" while composing "${"typeName"}".`,
    },
  },
  "filtered-dependency": {
    severity: "error",
    messages: {
      default: paramMessage`"${"typeName"}" depends on filtered-out ${"dependencyKind"} "${"dependencyName"}".`,
    },
  },
  "unsupported-relation-shape": {
    severity: "error",
    messages: {
      default: paramMessage`Property "${"propName"}" on "${"typeName"}" uses relation-like model type "${"targetName"}" without a supported relation shape.`,
    },
  },
  "mapped-by-missing-property": {
    severity: "error",
    messages: {
      default: paramMessage`@mappedBy("${"fieldName"}") on "${"propName"}" is invalid because "${"targetModel"}"."${"fieldName"}" does not exist.`,
    },
  },
  "foreign-key-local-missing": {
    severity: "error",
    messages: {
      default: paramMessage`@foreignKey("${"localField"}"${"targetFieldSuffix"}) on "${"propName"}" is invalid because local field/column "${"localField"}" does not exist on "${"modelName"}".`,
    },
  },
  "foreign-key-target-missing": {
    severity: "error",
    messages: {
      default: paramMessage`@foreignKey("${"localField"}"${"targetFieldSuffix"}) on "${"propName"}" is invalid because "${"targetModel"}"."${"targetField"}" does not exist.`,
    },
  },
  "foreign-key-type-mismatch": {
    severity: "error",
    messages: {
      default: paramMessage`@foreignKey("${"localField"}"${"targetFieldSuffix"}) on "${"propName"}" is invalid because "${"modelName"}"."${"resolvedLocalField"}" and "${"targetModel"}"."${"resolvedTargetField"}" have incompatible types (${"localType"} vs ${"targetType"}).`,
    },
  },
  "foreign-key-set-null-non-nullable": {
    severity: "error",
    messages: {
      default: paramMessage`@onDelete("SET NULL") on "${"propName"}" requires local FK "${"localField"}" to be optional.`,
    },
  },
  "one-to-one-missing-unique": {
    severity: "error",
    messages: {
      default: paramMessage`One-to-one relation "${"propName"}" on "${"modelName"}" requires local FK "${"localField"}" to be @unique or @key.`,
    },
  },
  "many-to-many-not-array": {
    severity: "error",
    messages: {
      default: paramMessage`@manyToMany("${"tableName"}") on "${"propName"}" requires an array of @table models.`,
    },
  },
  "many-to-many-target-not-table": {
    severity: "error",
    messages: {
      default: paramMessage`@manyToMany("${"tableName"}") on "${"propName"}" must target a model decorated with @table.`,
    },
  },
  "many-to-many-missing-inverse": {
    severity: "error",
    messages: {
      default: paramMessage`@manyToMany("${"tableName"}") on "${"modelName"}"."${"propName"}" is missing a matching inverse declaration on "${"targetModel"}".`,
    },
  },
  "many-to-many-conflicting-table": {
    severity: "error",
    messages: {
      default: paramMessage`@manyToMany on "${"modelName"}"."${"propName"}" uses join table "${"tableName"}", but "${"targetModel"}"."${"targetProp"}" uses "${"otherTableName"}".`,
    },
  },
  "many-to-many-conflicting-explicit-table": {
    severity: "error",
    messages: {
      default: paramMessage`@manyToMany("${"tableName"}") on "${"modelName"}"."${"propName"}" conflicts with explicit @table model "${"existingModel"}". Use an explicit junction model instead of shorthand.`,
    },
  },
  "many-to-many-target-missing-key": {
    severity: "error",
    messages: {
      default: paramMessage`@manyToMany("${"tableName"}") on "${"modelName"}"."${"propName"}" requires both "${"modelName"}" and "${"targetModel"}" to declare a @key, but "${"missingModel"}" has none.`,
    },
  },
  "default-expression-conflicts-literal": {
    severity: "error",
    messages: {
      default: paramMessage`@defaultExpression on "${"propName"}" cannot be combined with a literal default value. Use one or the other.`,
    },
  },
  "unsupported-persistence-type": {
    severity: "error",
    messages: {
      default: paramMessage`Type "${"typeName"}" on property "${"propName"}" is not supported by this emitter.`,
    },
  },
  "composite-column-not-found": {
    severity: "error",
    messages: {
      default: paramMessage`Column "${"columnName"}" referenced in @${"decorator"}("${"constraintName"}") does not exist in this model.`,
    },
  },
  "empty-composite-columns": {
    severity: "error",
    messages: {
      default: paramMessage`Composite type on property "${"propName"}" has no columns specified.`,
    },
  },
  "duplicate-column-in-composite": {
    severity: "error",
    messages: {
      default: paramMessage`Column "${"columnName"}" is duplicated in composite type on property "${"propName"}".`,
    },
  },
  "composite-column-conflict": {
    severity: "error",
    messages: {
      default: paramMessage`Column "${"columnName"}" is referenced by multiple composite types: "${"existingProp"}" and "${"currentProp"}". Each column can only be in one composite.`,
    },
  },
  "precision-on-non-numeric": {
    severity: "error",
    messages: {
      default: paramMessage`@precision can only be applied to decimal or float types, but "${"propName"}" has type "${"actualType"}".`,
    },
  },
  "auto-increment-on-non-integer": {
    severity: "error",
    messages: {
      default: paramMessage`@autoIncrement can only be applied to integer types (int32, int64, serial, bigserial), but "${"propName"}" has type "${"actualType"}".`,
    },
  },
  "auto-time-on-non-datetime": {
    severity: "error",
    messages: {
      default: paramMessage`@${"decorator"} requires a datetime type (utcDateTime, offsetDateTime), but "${"propName"}" has type "${"actualType"}".`,
    },
  },
  "auto-create-and-update-conflict": {
    severity: "error",
    messages: {
      default: paramMessage`Property "${"propName"}" cannot have both @autoCreateTime and @autoUpdateTime. Use one or the other.`,
    },
  },
  "multiple-auto-increment-columns": {
    severity: "error",
    messages: {
      default: `Model has multiple @autoIncrement properties. Only one auto-incrementing column is allowed per table.`,
    },
  },
  "auto-increment-requires-key": {
    severity: "error",
    messages: {
      default: paramMessage`@autoIncrement on "${"propName"}" requires the property to be a non-optional @key.`,
    },
  },
  "ignore-conflicts": {
    severity: "error",
    messages: {
      default: paramMessage`@ignore on "${"propName"}" conflicts with @${"conflicting"} - ignored properties cannot have database decorators.`,
    },
  },
  "duplicate-constraint-name": {
    severity: "error",
    messages: {
      default: paramMessage`@${"decorator"}("${"constraintName"}") has a duplicate name in this model.`,
    },
  },
  "empty-index-columns": {
    severity: "error",
    messages: {
      default: paramMessage`@${"decorator"}("${"constraintName"}") must have at least one column.`,
    },
  },
  "duplicate-column-in-index": {
    severity: "error",
    messages: {
      default: paramMessage`Column "${"columnName"}" is listed multiple times in @${"decorator"}("${"constraintName"}").`,
    },
  },
  "missing-key": {
    severity: "error",
    messages: {
      default: `Model marked as @table has no @key property. Consider adding a primary key.`,
    },
  },
  "foreign-key-without-index": {
    severity: "error",
    messages: {
      default: paramMessage`@foreignKey on "${"propName"}" has no @index/@unique/@key. PostgreSQL will not auto-create an index, which usually causes lookup hot-spots.`,
    },
  },
  "pg-reserved-identifier": {
    severity: "error",
    messages: {
      default: paramMessage`Identifier "${"name"}" is a PostgreSQL reserved word and will require quoting in DDL. Consider renaming.`,
    },
  },
  "polymorphic-empty-allowed-types": {
    severity: "error",
    messages: {
      default: paramMessage`@polymorphic on "${"propName"}" requires a non-empty list of allowed type tags.`,
    },
  },
  "polymorphic-column-conflict": {
    severity: "error",
    messages: {
      default: paramMessage`@polymorphic on "${"propName"}" cannot reuse existing column "${"columnName"}". Pick distinct typeColumn / idColumn names.`,
    },
  },
  "go-type-malformed": {
    severity: "error",
    messages: {
      default: paramMessage`@goType("${"value"}") on "${"propName"}" must be of the form "import/path.TypeName".`,
    },
  },

  // ─── Warnings ──────────────────────────────────────────────────────────────

  "redundant-unique-on-key": {
    severity: "warning",
    messages: {
      default: paramMessage`@unique on "${"propName"}" is redundant - primary keys are inherently unique.`,
    },
  },
  "redundant-index-on-unique": {
    severity: "warning",
    messages: {
      default: paramMessage`@index on "${"propName"}" is redundant - unique constraints already create an index.`,
    },
  },
  "redundant-map": {
    severity: "warning",
    messages: {
      default: paramMessage`@map("${"columnName"}") on "${"propName"}" is redundant - it matches the auto-derived column name.`,
    },
  },
  "cascade-without-relation": {
    severity: "warning",
    messages: {
      default: paramMessage`@${"decorator"} on "${"propName"}" has no effect - the property is not a relation or foreign key.`,
    },
  },
  "filter-selector-conflict": {
    severity: "warning",
    messages: {
      default: paramMessage`Selector "${"selector"}" appears in both include and exclude. Exclude wins.`,
    },
  },
  "filter-selector-redundant": {
    severity: "warning",
    messages: {
      default: paramMessage`Selector "${"selector"}" is redundant because "${"coveredBy"}" already covers it.`,
    },
  },
  "redundant-include-selector": {
    severity: "warning",
    messages: {
      default: paramMessage`Selector "${"selector"}" appears more than once in "${"list"}".`,
    },
  },
  "unused-scope": {
    severity: "warning",
    messages: {
      default: paramMessage`Scope "${"scope"}" is declared via @scope but no selector references it (#${"scope"}).`,
    },
  },
  "index-using-on-non-index": {
    severity: "warning",
    messages: {
      default: paramMessage`@indexUsing("${"method"}") on "${"propName"}" has no effect without @index, @unique, or @key.`,
    },
  },
} as const;
