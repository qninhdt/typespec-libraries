import {
  walkPropertiesInherited,
  type Model,
  type ModelProperty,
  type Program,
} from "@typespec/compiler";
import { reportDiagnostic, MapKey, ModelIndexesKey, ModelUniquesKey } from "./lib.js";
import type { ModelIndexSpec } from "./decorators.js";
import { resolveCompositeColumnName } from "./emitter-utils.js";
import {
  isTable,
  getColumnName,
  getCheck,
  isKey,
  isUnique,
  isIndex,
  isAutoIncrement,
  isAutoCreateTime,
  isAutoUpdateTime,
  isIgnored,
  isVersionColumn,
  getPrecision,
  getForeignKey,
  getDefaultExpression,
  resolveDbType,
  camelToSnake,
} from "./helpers.js";

// ─── Type-check sets ────────────────────────────────────────────────────────

/** Types that accept @precision */
export const PRECISION_TYPES = new Set(["decimal", "float32", "float64"]);

/** Types that accept @autoIncrement */
export const INTEGER_TYPES = new Set([
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

/** Types that accept @autoCreateTime / @autoUpdateTime */
export const DATETIME_TYPES = new Set(["utcDateTime", "offsetDateTime"]);

// ─── Duplicate table name check ──────────────────────────────────────────────

export function validateDuplicateTableNames(
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

export function validateModel(program: Program, model: Model): void {
  let idCount = 0;
  let versionCount = 0;
  let autoIncrementCount = 0;
  const columnNames = new Map<string, string>(); // columnName → propName
  const constraintNames = new Map<string, string>(); // constraintName -> decorator

  for (const prop of walkPropertiesInherited(model)) {
    if (prop.type.kind === "Model" && isTable(program, prop.type as Model)) {
      continue;
    }
    if (prop.type.kind === "Model" && (prop.type as Model).indexer?.value?.kind === "Model") {
      continue;
    }

    if (isKey(program, prop)) {
      idCount++;
    }

    if (isAutoIncrement(program, prop)) {
      autoIncrementCount++;
      if (!isKey(program, prop) || prop.optional) {
        reportDiagnostic(program, {
          code: "auto-increment-requires-key",
          target: prop,
          format: { propName: prop.name },
        });
      }
    }

    if (isVersionColumn(program, prop)) versionCount++;

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

    validatePropertyDecorators(program, prop);

    const check = getCheck(program, prop);
    if (check) {
      const existing = constraintNames.get(check.name);
      if (existing) {
        reportDiagnostic(program, {
          code: "duplicate-constraint-name",
          target: prop,
          format: { decorator: "check", constraintName: check.name },
        });
      } else {
        constraintNames.set(check.name, "check");
      }
    }
  }

  if (idCount > 1) {
    reportDiagnostic(program, { code: "multiple-keys", target: model });
  }

  if (idCount === 0) {
    reportDiagnostic(program, { code: "missing-key", target: model });
  }

  if (versionCount > 1) {
    reportDiagnostic(program, { code: "multiple-version-columns", target: model });
  }

  if (autoIncrementCount > 1) {
    reportDiagnostic(program, { code: "multiple-auto-increment-columns", target: model });
  }

  validateCompositeConstraints(program, model, columnNames);
  validateModelLevelIndexes(program, model, columnNames);
}

// ─── Property-level validations ──────────────────────────────────────────────

function validatePropertyDecorators(program: Program, prop: ModelProperty): void {
  const dbType = resolveDbType(prop.type);
  const typeName = dbType ?? prop.type.kind;

  if (isIgnored(program, prop)) {
    reportIgnoreConflicts(program, prop);
    return;
  }

  validateTypedDecorators(program, prop, dbType, typeName);

  if (isKey(program, prop) && isUnique(program, prop)) {
    reportDiagnostic(program, {
      code: "redundant-unique-on-key",
      target: prop,
      format: { propName: prop.name },
    });
  }

  if (isUnique(program, prop) && isIndex(program, prop)) {
    reportDiagnostic(program, {
      code: "redundant-index-on-unique",
      target: prop,
      format: { propName: prop.name },
    });
  }

  const colName = getColumnName(program, prop);
  const autoName = camelToSnake(prop.name);
  if (colName === autoName && hasExplicitMap(program, prop)) {
    reportDiagnostic(program, {
      code: "redundant-map",
      target: prop,
      format: { propName: prop.name, columnName: colName },
    });
  }

  // @defaultExpression and a literal default are mutually exclusive — picking
  // both leaves the emitter to silently choose one and is almost always a bug.
  if (getDefaultExpression(program, prop) !== undefined && prop.defaultValue !== undefined) {
    reportDiagnostic(program, {
      code: "default-expression-conflicts-literal",
      target: prop,
      format: { propName: prop.name },
    });
  }

  // @autoCreateTime and @autoUpdateTime are mutually exclusive on the same property —
  // a column can be set on insert OR refreshed on update, but not both.
  if (isAutoCreateTime(program, prop) && isAutoUpdateTime(program, prop)) {
    reportDiagnostic(program, {
      code: "auto-create-and-update-conflict",
      target: prop,
      format: { propName: prop.name },
    });
  }
}

function reportIgnoreConflicts(program: Program, prop: ModelProperty): void {
  const conflictChecks = [
    ["key", isKey(program, prop)],
    ["index", isIndex(program, prop)],
    ["unique", isUnique(program, prop)],
    ["autoIncrement", isAutoIncrement(program, prop)],
    ["autoCreateTime", isAutoCreateTime(program, prop)],
    ["autoUpdateTime", isAutoUpdateTime(program, prop)],
    ["foreignKey", !!getForeignKey(program, prop)],
  ] as const;

  for (const [conflicting, enabled] of conflictChecks) {
    if (!enabled) {
      continue;
    }

    reportDiagnostic(program, {
      code: "ignore-conflicts",
      target: prop,
      format: { propName: prop.name, conflicting },
    });
  }
}

function validateTypedDecorators(
  program: Program,
  prop: ModelProperty,
  dbType: string | undefined,
  typeName: string,
): void {
  reportInvalidDecoratorType(dbType, getPrecision(program, prop), {
    allowedTypes: PRECISION_TYPES,
    report: () =>
      reportDiagnostic(program, {
        code: "precision-on-non-numeric",
        target: prop,
        format: { propName: prop.name, actualType: typeName },
      }),
  });
  reportInvalidDecoratorType(dbType, isAutoIncrement(program, prop), {
    allowedTypes: INTEGER_TYPES,
    report: () =>
      reportDiagnostic(program, {
        code: "auto-increment-on-non-integer",
        target: prop,
        format: { propName: prop.name, actualType: typeName },
      }),
  });

  for (const [enabled, decorator] of [
    [isAutoCreateTime(program, prop), "autoCreateTime"],
    [isAutoUpdateTime(program, prop), "autoUpdateTime"],
  ] as const) {
    if (!enabled || (dbType && DATETIME_TYPES.has(dbType))) {
      continue;
    }

    reportDiagnostic(program, {
      code: "auto-time-on-non-datetime",
      target: prop,
      format: { propName: prop.name, actualType: typeName, decorator },
    });
  }
}

function reportInvalidDecoratorType(
  dbType: string | undefined,
  enabled: unknown,
  options: { allowedTypes: Set<string>; report: () => void },
): void {
  if (!enabled || (dbType && options.allowedTypes.has(dbType))) {
    return;
  }

  options.report();
}

// ─── Composite constraint column validation ──────────────────────────────────

function validateCompositeConstraints(
  program: Program,
  model: Model,
  columnNames: Map<string, string>,
): void {
  const validColumns = new Set(columnNames.keys());

  // Track all resolved composite columns to detect conflicts.
  const compositeFieldColumns = new Map<
    string,
    { propName: string; isUnique: boolean; isPrimary: boolean }
  >();

  for (const prop of walkPropertiesInherited(model)) {
    const propName = prop.name;
    const compositeColumns = getCompositeFieldsHelper(program, prop);
    if (!compositeColumns) continue;

    const propIsUnique = isUnique(program, prop);
    const propIsPrimary = isKey(program, prop);

    for (const col of compositeColumns) {
      const resolvedCol = resolveCompositeColumnName(program, model, col);
      const existing = compositeFieldColumns.get(resolvedCol);
      if (existing) {
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
      compositeFieldColumns.set(resolvedCol, {
        propName,
        isUnique: propIsUnique,
        isPrimary: propIsPrimary,
      });
    }
  }

  for (const prop of walkPropertiesInherited(model)) {
    const propName = prop.name;
    const compositeColumns = getCompositeFieldsHelper(program, prop);
    if (!compositeColumns) continue;

    if (compositeColumns.length === 0) {
      reportDiagnostic(program, {
        code: "empty-composite-columns",
        target: prop,
        format: { propName },
      });
      continue;
    }

    const seenColumns = new Set<string>();
    for (const col of compositeColumns) {
      const resolvedCol = resolveCompositeColumnName(program, model, col);
      if (seenColumns.has(resolvedCol)) {
        reportDiagnostic(program, {
          code: "duplicate-column-in-composite",
          target: prop,
          format: { columnName: col, propName },
        });
      }
      seenColumns.add(resolvedCol);

      if (!validColumns.has(resolvedCol)) {
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

// Local copy to avoid widening this module's external imports.
function getCompositeFieldsHelper(_program: Program, prop: ModelProperty): string[] | undefined {
  const type = prop.type;
  if (type.kind !== "Scalar") return undefined;
  const scalar = type as {
    name?: string;
    node?: { id?: { escapedText?: string } };
    templateMapper?: { args?: unknown };
  };
  const name = scalar.name ?? scalar.node?.id?.escapedText;
  if (name !== "composite") return undefined;
  const args = scalar.templateMapper?.args;
  if (!args || !Array.isArray(args)) return undefined;
  const columns: string[] = [];
  for (const arg of args) {
    if (!arg || typeof arg !== "object" || !("type" in arg)) continue;
    const t = (arg as { type: unknown }).type as { kind: string; value?: string } | undefined;
    if (t?.kind === "String" && t.value) columns.push(t.value);
  }
  return columns.length > 0 ? columns : undefined;
}

// ─── Model-level @@tableIndex / @@tableUnique column validation ──────────────

function validateModelLevelIndexes(
  program: Program,
  model: Model,
  columnNames: Map<string, string>,
): void {
  const validColumns = new Set(columnNames.keys());
  const indexSpecs =
    (program.stateMap(ModelIndexesKey).get(model) as ModelIndexSpec[] | undefined) ?? [];
  const uniqueSpecs =
    (program.stateMap(ModelUniquesKey).get(model) as ModelIndexSpec[] | undefined) ?? [];

  for (const spec of indexSpecs) {
    validateIndexSpec(program, model, spec, "tableIndex", validColumns);
  }
  for (const spec of uniqueSpecs) {
    validateIndexSpec(program, model, spec, "tableUnique", validColumns);
  }
}

function validateIndexSpec(
  program: Program,
  model: Model,
  spec: ModelIndexSpec,
  decorator: "tableIndex" | "tableUnique",
  validColumns: Set<string>,
): void {
  const constraintName = spec.name ?? `${model.name}_${decorator}`;

  if (!spec.columns || spec.columns.length === 0) {
    reportDiagnostic(program, {
      code: "empty-index-columns",
      target: model,
      format: { decorator, constraintName },
    });
    return;
  }

  const seen = new Set<string>();
  for (const col of spec.columns) {
    const resolved = resolveCompositeColumnName(program, model, col);
    if (seen.has(resolved)) {
      reportDiagnostic(program, {
        code: "duplicate-column-in-index",
        target: model,
        format: { columnName: col, decorator, constraintName },
      });
    }
    seen.add(resolved);

    if (!validColumns.has(resolved)) {
      reportDiagnostic(program, {
        code: "composite-column-not-found",
        target: model,
        format: {
          columnName: col,
          decorator,
          constraintName,
        },
      });
    }
  }
}

function hasExplicitMap(program: Program, prop: ModelProperty): boolean {
  return program.stateMap(MapKey).has(prop);
}
