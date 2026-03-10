/**
 * Model-level validation pass for @qninhdt/typespec-orm.
 *
 * Exported as `$onValidate` from the library entry point so the TypeSpec
 * compiler calls it after all decorators have been applied.
 */

import type { Model, ModelProperty, Program } from "@typespec/compiler";
import { reportDiagnostic, TableKey } from "./lib.js";
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
} from "./helpers.js";

// ─── Public entry point ──────────────────────────────────────────────────────

export function $onValidate(program: Program): void {
  const tableModels: { model: Model; tableName: string }[] = [];

  // Collect all @table models
  for (const [type, name] of program.stateMap(TableKey)) {
    if (type.kind === "Model") {
      const model = type as Model;
      const tableName = (name as string) || deriveTableNameForValidation(model.name);
      tableModels.push({ model, tableName });
    }
  }

  // 1. Duplicate table names
  validateDuplicateTableNames(program, tableModels);

  // 2. Per-model validations
  for (const { model } of tableModels) {
    validateModel(program, model);
  }
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
      validateRelationProperty(program, prop);
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
    const NUMERIC_TYPES = new Set(["decimal", "float32", "float64", "int32", "int64"]);
    if (!dbType || !NUMERIC_TYPES.has(dbType)) {
      reportDiagnostic(program, {
        code: "precision-on-non-numeric",
        target: prop,
        format: { propName: prop.name, actualType: typeName },
      });
    }
  }

  // @autoIncrement on non-integer
  if (isAutoIncrement(program, prop)) {
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
    const DATETIME_TYPES = new Set(["utcDateTime"]);
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
      const DATETIME_TYPES = new Set(["utcDateTime"]);
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

// ─── Relation property validations ───────────────────────────────────────────

function validateRelationProperty(_program: Program, _prop: ModelProperty): void {
  // @onDelete/@onUpdate without FK or relation type is useless on scalar props
  // (but valid on Model-typed relation props - those are checked here)
  // No validation needed: onDelete/onUpdate IS valid on relation props
}

// ─── Cascade on non-relation check (called for scalar props) ─────────────────

/** Check if @onDelete or @onUpdate is used on non-relation scalar properties */
export function validateCascadeOnScalar(
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

  for (const idx of getCompositeIndexes(program, model)) {
    for (const col of idx.columns) {
      if (!validColumns.has(col)) {
        reportDiagnostic(program, {
          code: "composite-column-not-found",
          target: model,
          format: {
            columnName: col,
            decorator: "compositeIndex",
            constraintName: idx.name,
          },
        });
      }
    }
  }

  for (const unq of getCompositeUniques(program, model)) {
    for (const col of unq.columns) {
      if (!validColumns.has(col)) {
        reportDiagnostic(program, {
          code: "composite-column-not-found",
          target: model,
          format: {
            columnName: col,
            decorator: "compositeUnique",
            constraintName: unq.name,
          },
        });
      }
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

import { MapKey } from "./lib.js";

/** Check if a property has an explicit @map() decorator (vs auto-derived name) */
function hasExplicitMap(program: Program, prop: ModelProperty): boolean {
  return program.stateMap(MapKey).has(prop);
}

/** Derive table name from model name (duplicated from helpers to avoid circular deps) */
function deriveTableNameForValidation(modelName: string): string {
  const snake = camelToSnake(modelName);
  if (snake.endsWith("s")) return snake;
  if (snake.endsWith("y")) return snake.slice(0, -1) + "ies";
  return snake + "s";
}
