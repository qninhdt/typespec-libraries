import { createTypeSpecLibrary, paramMessage } from "@typespec/compiler";

export const $lib = createTypeSpecLibrary({
  name: "@qninhdt/typespec-orm",
  diagnostics: {
    // ─── Errors ────────────────────────────────────────────────────────────────

    "multiple-keys": {
      severity: "error",
      messages: {
        default: `Model has multiple @key properties. Only one primary key is allowed per table.`,
      },
    },
    "multiple-soft-deletes": {
      severity: "error",
      messages: {
        default: `Model has multiple @softDelete properties. Only one soft-delete timestamp is allowed per table.`,
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
    "soft-delete-on-non-datetime": {
      severity: "error",
      messages: {
        default: paramMessage`@softDelete requires a datetime type (utcDateTime, offsetDateTime), but "${"propName"}" has type "${"actualType"}".`,
      },
    },
    "auto-time-on-non-datetime": {
      severity: "error",
      messages: {
        default: paramMessage`@${"decorator"} requires a datetime type (utcDateTime, offsetDateTime), but "${"propName"}" has type "${"actualType"}".`,
      },
    },
    "ignore-conflicts": {
      severity: "error",
      messages: {
        default: paramMessage`@ignore on "${"propName"}" conflicts with @${"conflicting"} - ignored properties cannot have database decorators.`,
      },
    },

    // ─── Warnings ──────────────────────────────────────────────────────────────

    "missing-key": {
      severity: "warning",
      messages: {
        default: `Model marked as @table has no @key property. Consider adding a primary key.`,
      },
    },
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
    "invalid-foreign-key": {
      severity: "warning",
      messages: {
        default: `@foreignKey reference could not be validated. Ensure the target table and column exist.`,
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
  },
  state: {
    table: { description: "Maps Model → table name" },
    id: { description: "Marks ModelProperty as primary key" },
    map: { description: "Maps ModelProperty → column name" },
    index: { description: "Maps ModelProperty → index name" },
    unique: { description: "Marks ModelProperty as unique" },
    autoIncrement: { description: "Marks ModelProperty as auto-increment" },
    softDelete: { description: "Marks ModelProperty as soft-delete timestamp" },
    foreignKey: {
      description: "Maps ModelProperty → field name for FK column (string)",
    },
    mappedBy: {
      description: "Maps ModelProperty → inverse property name for collection-side relations",
    },
    autoCreateTime: {
      description: "Marks ModelProperty as auto-set on creation",
    },
    autoUpdateTime: {
      description: "Marks ModelProperty as auto-set on every update",
    },
    precision: {
      description: "Maps ModelProperty → { precision, scale } for NUMERIC/DECIMAL",
    },
    onDelete: {
      description: "Maps ModelProperty → ON DELETE action string",
    },
    onUpdate: {
      description: "Maps ModelProperty → ON UPDATE action string",
    },
    ignore: { description: "Marks ModelProperty as ignored (not a DB column)" },
    // ─── Data / Form decorators ──────────────────────────────────────────────
    data: { description: "Marks Model as a non-DB data/form shape" },
    title: { description: "Maps ModelProperty → human-readable field title" },
    placeholder: { description: "Maps ModelProperty → input placeholder text" },
    inputType: { description: "Maps Scalar → HTML input type hint" },
  },
} as const);

export const { reportDiagnostic } = $lib;

// ─── State Keys ──────────────────────────────────────────────────────────────
// Typed symbol keys for program.stateMap() / program.stateSet() access.

export const TableKey = $lib.stateKeys.table;
export const MapKey = $lib.stateKeys.map;
export const IndexKey = $lib.stateKeys.index;
export const UniqueKey = $lib.stateKeys.unique;
export const AutoIncrementKey = $lib.stateKeys.autoIncrement;
export const SoftDeleteKey = $lib.stateKeys.softDelete;
export const ForeignKeyKey = $lib.stateKeys.foreignKey;
export const MappedByKey = $lib.stateKeys.mappedBy;
export const AutoCreateTimeKey = $lib.stateKeys.autoCreateTime;
export const AutoUpdateTimeKey = $lib.stateKeys.autoUpdateTime;
export const PrecisionKey = $lib.stateKeys.precision;
export const OnDeleteKey = $lib.stateKeys.onDelete;
export const OnUpdateKey = $lib.stateKeys.onUpdate;
export const IgnoreKey = $lib.stateKeys.ignore;
export const DataKey = $lib.stateKeys.data;
export const TitleKey = $lib.stateKeys.title;
export const PlaceholderKey = $lib.stateKeys.placeholder;
export const InputTypeKey = $lib.stateKeys.inputType;
