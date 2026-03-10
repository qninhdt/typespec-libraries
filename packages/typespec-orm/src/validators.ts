/**
 * Model-level validation pass for @qninhdt/typespec-orm.
 *
 * Exported as `$onValidate` from the library entry point so the TypeSpec
 * compiler calls it after all decorators have been applied.
 */

import type { Model, ModelProperty, Program } from "@typespec/compiler";
import { reportDiagnostic, MapKey, TableKey } from "./lib.js";
import {
  isTable,
  getColumnName,
  isId,
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
  getRelation,
  getCompositeIndexes,
  getCompositeUniques,
  resolveDbType,
  camelToSnake,
  deriveTableName,
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
const DATETIME_TYPES = new Set(["utcDateTime"]);

// ─── Public entry point ──────────────────────────────────────────────────────

export function $onValidate(program: Program): void {
  const tableModels: { model: Model; tableName: string }[] = [];

  // Collect all @table models
  for (const [type, name] of program.stateMap(TableKey)) {
    if (type.kind === "Model") {
      const model = type as Model;
      const tableName = (name as string) || deriveTableName(model.name);
      tableModels.push({ model, tableName });
    }
  }

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

    // Count @id
    if (isId(program, prop)) idCount++;

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

  // Multiple @id
  if (idCount > 1) {
    reportDiagnostic(program, {
      code: "multiple-ids",
      target: model,
    });
  }

  // Missing @id
  if (idCount === 0) {
    reportDiagnostic(program, {
      code: "missing-id",
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
    if (isId(program, prop)) conflicts.push("id");
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

  // @unique on @id (redundant)
  if (isId(program, prop) && isUnique(program, prop)) {
    reportDiagnostic(program, {
      code: "redundant-unique-on-id",
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
      const hasRelation = !!getRelation(program, prop);

      if (!hasFk && !hasRelation) {
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

  const constraints: { entries: { name: string; columns: string[] }[]; decorator: string }[] = [
    { entries: getCompositeIndexes(program, model), decorator: "compositeIndex" },
    { entries: getCompositeUniques(program, model), decorator: "compositeUnique" },
  ];

  for (const { entries, decorator } of constraints) {
    for (const entry of entries) {
      for (const col of entry.columns) {
        if (!validColumns.has(col)) {
          reportDiagnostic(program, {
            code: "composite-column-not-found",
            target: model,
            format: {
              columnName: col,
              decorator,
              constraintName: entry.name,
            },
          });
        }
      }
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Check if a property has an explicit @map() decorator (vs auto-derived name) */
function hasExplicitMap(program: Program, prop: ModelProperty): boolean {
  return program.stateMap(MapKey).has(prop);
}
