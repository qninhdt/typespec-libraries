/**
 * Model-level validation pass for @qninhdt/typespec-orm.
 *
 * Exported as `$onValidate` from the library entry point so the TypeSpec
 * compiler calls it after all decorators have been applied.
 */

import type { Model, ModelProperty, Program } from "@typespec/compiler";
import { reportDiagnostic, MapKey } from "./lib.js";
import {
  isTable,
  getColumnName,
  isKey,
  isUnique,
  isIndex,
  isAutoIncrement,
  isSoftDelete,
  isAutoCreateTime,
  isAutoUpdateTime,
  isIgnored,
  getPrecision,
  getForeignKey,
  getOnDelete,
  getOnUpdate,
  getMappedBy,
  getCompositeFields,
  resolveDbType,
  camelToSnake,
  collectTableModels,
} from "./helpers.js";

// ─── Type‐check Sets (module‐level to avoid per‐call allocation) ─────────────

/** Types that accept @precision */
const PRECISION_TYPES = new Set(["decimal", "float32", "float64", "int32", "int64"]);

/** Types that accept @autoIncrement */
const INTEGER_TYPES = new Set([
  "int8",
  "int16",
  "int32",
  "int64",
  "uint8",
  "uint16",
  "uint32",
  "uint64",
  "serial",
  "bigserial",
]);

/** Types that accept @softDelete / @autoCreateTime / @autoUpdateTime */
const DATETIME_TYPES = new Set(["utcDateTime", "offsetDateTime"]);

// ─── Public entry point ──────────────────────────────────────────────────────

export function $onValidate(program: Program): void {
  const tableModels = collectTableModels(program);

  // 1. Duplicate table names
  validateDuplicateTableNames(program, tableModels);

  // 2. Per-model validations
  for (const { model } of tableModels) {
    validateModel(program, model);
  }

  // 3. @onDelete/@onUpdate on non-relation scalar props
  validateCascadeOnScalar(program, tableModels);
}

// ─── Duplicate table name check ──────────────────────────────────────────────

function validateDuplicateTableNames(
  program: Program,
  tableModels: { model: Model; tableName: string }[],
): void {
  const seen = new Map<string, Model>();
  for (const { model, tableName } of tableModels) {
    const existing = seen.get(tableName);
    if (existing) {
      reportDiagnostic(program, {
        code: "duplicate-table-name",
        target: model,
        format: { tableName, existingModel: existing.name },
      });
    } else {
      seen.set(tableName, model);
    }
  }
}

// ─── Per-model validation ────────────────────────────────────────────────────

function validateModel(program: Program, model: Model): void {
  let idCount = 0;
  let softDeleteCount = 0;
  const columnNames = new Map<string, string>(); // columnName → propName

  for (const [, prop] of model.properties) {
    // Skip navigation/array properties (relations)
    if (prop.type.kind === "Model" && isTable(program, prop.type as Model)) {
      continue;
    }
    if (prop.type.kind === "Model" && (prop.type as Model).indexer?.value?.kind === "Model") {
      continue;
    }

    if (isKey(program, prop)) idCount++;

    // Count @softDelete
    if (isSoftDelete(program, prop)) softDeleteCount++;

    // Duplicate column names
    if (!isIgnored(program, prop)) {
      const colName = getColumnName(program, prop);
      const existing = columnNames.get(colName);
      if (existing) {
        reportDiagnostic(program, {
          code: "duplicate-column-name",
          target: prop,
          format: { columnName: colName, prop1: existing, prop2: prop.name },
        });
      } else {
        columnNames.set(colName, prop.name);
      }
    }

    // Per-property validations
    validatePropertyDecorators(program, prop);
  }

  // Multiple @key
  if (idCount > 1) {
    reportDiagnostic(program, {
      code: "multiple-keys",
      target: model,
    });
  }

  // Missing @key
  if (idCount === 0) {
    reportDiagnostic(program, {
      code: "missing-key",
      target: model,
    });
  }

  // Multiple @softDelete
  if (softDeleteCount > 1) {
    reportDiagnostic(program, {
      code: "multiple-soft-deletes",
      target: model,
    });
  }

  // Composite constraint column references
  validateCompositeConstraints(program, model, columnNames);
}

// ─── Property-level validations ──────────────────────────────────────────────

function validatePropertyDecorators(program: Program, prop: ModelProperty): void {
  const dbType = resolveDbType(prop.type);
  const typeName = dbType ?? prop.type.kind;

  // @ignore conflicts
  if (isIgnored(program, prop)) {
    const conflicts: string[] = [];
    if (isKey(program, prop)) conflicts.push("key");
    if (isIndex(program, prop)) conflicts.push("index");
    if (isUnique(program, prop)) conflicts.push("unique");
    if (isAutoIncrement(program, prop)) conflicts.push("autoIncrement");
    if (isSoftDelete(program, prop)) conflicts.push("softDelete");
    if (isAutoCreateTime(program, prop)) conflicts.push("autoCreateTime");
    if (isAutoUpdateTime(program, prop)) conflicts.push("autoUpdateTime");
    if (getForeignKey(program, prop)) conflicts.push("foreignKey");

    for (const conflicting of conflicts) {
      reportDiagnostic(program, {
        code: "ignore-conflicts",
        target: prop,
        format: { propName: prop.name, conflicting },
      });
    }
    return; // No further checks needed for ignored props
  }

  // @precision on non-numeric
  if (getPrecision(program, prop)) {
    if (!dbType || !PRECISION_TYPES.has(dbType)) {
      reportDiagnostic(program, {
        code: "precision-on-non-numeric",
        target: prop,
        format: { propName: prop.name, actualType: typeName },
      });
    }
  }

  // @autoIncrement on non-integer
  if (isAutoIncrement(program, prop)) {
    if (!dbType || !INTEGER_TYPES.has(dbType)) {
      reportDiagnostic(program, {
        code: "auto-increment-on-non-integer",
        target: prop,
        format: { propName: prop.name, actualType: typeName },
      });
    }
  }

  // @softDelete on non-datetime
  if (isSoftDelete(program, prop)) {
    if (!dbType || !DATETIME_TYPES.has(dbType)) {
      reportDiagnostic(program, {
        code: "soft-delete-on-non-datetime",
        target: prop,
        format: { propName: prop.name, actualType: typeName },
      });
    }
  }

  // @autoCreateTime / @autoUpdateTime on non-datetime
  for (const [check, decorator] of [
    [isAutoCreateTime, "autoCreateTime"],
    [isAutoUpdateTime, "autoUpdateTime"],
  ] as const) {
    if (check(program, prop)) {
      if (!dbType || !DATETIME_TYPES.has(dbType)) {
        reportDiagnostic(program, {
          code: "auto-time-on-non-datetime",
          target: prop,
          format: { propName: prop.name, actualType: typeName, decorator },
        });
      }
    }
  }

  // @unique on @key (redundant)
  if (isKey(program, prop) && isUnique(program, prop)) {
    reportDiagnostic(program, {
      code: "redundant-unique-on-key",
      target: prop,
      format: { propName: prop.name },
    });
  }

  // @index on @unique (redundant)
  if (isUnique(program, prop) && isIndex(program, prop)) {
    reportDiagnostic(program, {
      code: "redundant-index-on-unique",
      target: prop,
      format: { propName: prop.name },
    });
  }

  // @map producing same name as auto-derived (redundant)
  // Use a simpler check: if @map is set and value equals camelToSnake(prop.name)
  const colName = getColumnName(program, prop);
  const autoName = camelToSnake(prop.name);
  if (colName === autoName && hasExplicitMap(program, prop)) {
    reportDiagnostic(program, {
      code: "redundant-map",
      target: prop,
      format: { propName: prop.name, columnName: colName },
    });
  }
}

// ─── Cascade on non-relation check ───────────────────────────────────────────

/** Check if @onDelete or @onUpdate is used on non-relation scalar properties */
function validateCascadeOnScalar(
  program: Program,
  tableModels: { model: Model; tableName: string }[],
): void {
  for (const { model } of tableModels) {
    for (const [, prop] of model.properties) {
      // Skip Model-typed (relations)
      if (prop.type.kind === "Model") continue;

      const hasFk = !!getForeignKey(program, prop);
      const hasMappedBy = !!getMappedBy(program, prop);

      if (!hasFk && !hasMappedBy) {
        if (getOnDelete(program, prop)) {
          reportDiagnostic(program, {
            code: "cascade-without-relation",
            target: prop,
            format: { decorator: "onDelete", propName: prop.name },
          });
        }
        if (getOnUpdate(program, prop)) {
          reportDiagnostic(program, {
            code: "cascade-without-relation",
            target: prop,
            format: { decorator: "onUpdate", propName: prop.name },
          });
        }
      }
    }
  }
}

// ─── Composite constraint column validation ──────────────────────────────────

function validateCompositeConstraints(
  program: Program,
  model: Model,
  columnNames: Map<string, string>,
): void {
  const validColumns = new Set(columnNames.keys());

  // Track all composite field columns (from composite<> type) to detect conflicts
  const compositeFieldColumns = new Map<
    string,
    { propName: string; isUnique: boolean; isPrimary: boolean }
  >();

  // First, collect all composite type fields from properties
  for (const [propName, prop] of model.properties) {
    const compositeColumns = getCompositeFields(program, prop);
    if (!compositeColumns) continue;

    const propIsUnique = isUnique(program, prop);
    const propIsPrimary = isKey(program, prop);

    for (const col of compositeColumns) {
      const existing = compositeFieldColumns.get(col);
      if (existing) {
        // Conflict: same column in multiple composite fields
        reportDiagnostic(program, {
          code: "composite-column-conflict",
          target: prop,
          format: {
            columnName: col,
            existingProp: existing.propName,
            currentProp: propName,
          },
        });
      }
      compositeFieldColumns.set(col, {
        propName,
        isUnique: propIsUnique,
        isPrimary: propIsPrimary,
      });
    }
  }

  // Check composite type fields reference valid columns
  for (const [propName, prop] of model.properties) {
    const compositeColumns = getCompositeFields(program, prop);
    if (!compositeColumns) continue;

    // Check for empty columns
    if (compositeColumns.length === 0) {
      reportDiagnostic(program, {
        code: "empty-composite-columns",
        target: prop,
        format: { propName },
      });
      continue;
    }

    // Check for duplicate columns in same composite
    const seenColumns = new Set<string>();
    for (const col of compositeColumns) {
      if (seenColumns.has(col)) {
        reportDiagnostic(program, {
          code: "duplicate-column-in-composite",
          target: prop,
          format: { columnName: col, propName },
        });
      }
      seenColumns.add(col);

      // Check for non-existent column
      if (!validColumns.has(col)) {
        reportDiagnostic(program, {
          code: "composite-column-not-found",
          target: prop,
          format: {
            columnName: col,
            decorator: "composite",
            constraintName: propName,
          },
        });
      }
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Check if a property has an explicit @map() decorator (vs auto-derived name) */
function hasExplicitMap(program: Program, prop: ModelProperty): boolean {
  return program.stateMap(MapKey).has(prop);
}
