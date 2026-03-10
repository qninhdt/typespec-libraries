import { createTypeSpecLibrary, paramMessage } from "@typespec/compiler";

export const $lib = createTypeSpecLibrary({
  name: "@qninhdt/typespec-orm",
  diagnostics: {
    // ─── Errors ────────────────────────────────────────────────────────────────

    "multiple-ids": {
      severity: "error",
      messages: {
        default: `Model has multiple @id properties. Only one primary key is allowed per table.`,
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

    "missing-id": {
      severity: "warning",
      messages: {
        default: `Model marked as @table has no @id property. Consider adding a primary key.`,
      },
    },
    "redundant-unique-on-id": {
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
      description: "Maps ModelProperty → { table, column } foreign key ref",
    },
    relation: {
      description: "Maps ModelProperty → { type, foreignKey? } relation config",
    },
    compositeIndex: {
      description: "Maps Model → array of { name, columns } composite indexes",
    },
    compositeUnique: {
      description: "Maps Model → array of { name, columns } composite unique constraints",
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
  },
} as const);

export const { reportDiagnostic } = $lib;

// ─── State Keys ──────────────────────────────────────────────────────────────
// Typed symbol keys for program.stateMap() / program.stateSet() access.

export const TableKey = $lib.stateKeys.table;
export const IdKey = $lib.stateKeys.id;
export const MapKey = $lib.stateKeys.map;
export const IndexKey = $lib.stateKeys.index;
export const UniqueKey = $lib.stateKeys.unique;
export const AutoIncrementKey = $lib.stateKeys.autoIncrement;
export const SoftDeleteKey = $lib.stateKeys.softDelete;
export const ForeignKeyKey = $lib.stateKeys.foreignKey;
export const RelationKey = $lib.stateKeys.relation;
export const CompositeIndexKey = $lib.stateKeys.compositeIndex;
export const CompositeUniqueKey = $lib.stateKeys.compositeUnique;
export const AutoCreateTimeKey = $lib.stateKeys.autoCreateTime;
export const AutoUpdateTimeKey = $lib.stateKeys.autoUpdateTime;
export const PrecisionKey = $lib.stateKeys.precision;
export const OnDeleteKey = $lib.stateKeys.onDelete;
export const OnUpdateKey = $lib.stateKeys.onUpdate;
export const IgnoreKey = $lib.stateKeys.ignore;
