/**
 * Model-level validation pass for @qninhdt/typespec-orm.
 *
 * Exported as `$onValidate` from the library entry point so the TypeSpec
 * compiler calls it after all decorators have been applied.
 */

import {
  walkPropertiesInherited,
  type Model,
  type ModelProperty,
  type Program,
} from "@typespec/compiler";
import { reportDiagnostic, MapKey, ModelIndexesKey, ModelUniquesKey } from "./lib.js";
import type { ModelIndexSpec } from "./decorators.js";
import { normalizeOrmGraph } from "./normalization.js";
import { resolveCompositeColumnName } from "./emitter-utils.js";
import {
  arePropertyTypesCompatible,
  describeComparableType,
  isTable,
  getColumnName,
  getCheck,
  isKey,
  isUnique,
  isIndex,
  getIndexName,
  getUniqueName,
  isAutoIncrement,
  isSoftDelete,
  isAutoCreateTime,
  isAutoUpdateTime,
  isIgnored,
  isVersionColumn,
  isTenantIdColumn,
  getPrecision,
  getForeignKey,
  getForeignKeyConfig,
  getManyToMany,
  getOnDelete,
  getOnUpdate,
  getMappedBy,
  getCompositeFields,
  getDefaultExpression,
  getTypeFullName,
  getPolymorphicConfig,
  getGoType,
  getIndexUsing,
  resolveDbType,
  camelToSnake,
  collectTableModels,
  isRelationLocalKeyUnique,
  resolvePropertyReference,
  resolvePropertyByName,
  resolveMappedByTarget,
  unwrapArrayType,
  findPrimaryKey,
} from "./helpers.js";
import { isPgReservedWord } from "./identifier-policy.js";

// ─── Type‐check Sets (module‐level to avoid per‐call allocation) ─────────────

/** Types that accept @precision */
const PRECISION_TYPES = new Set(["decimal", "float32", "float64"]);

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

  // 3b. FK columns missing an index → predictable PG hot-spot
  validateForeignKeyIndex(program, tableModels);

  // 4. Relation-specific validation shared by all emitters
  validateRelations(program, tableModels);

  // 5. Additional shared constraint and shorthand validations
  validateManyToMany(program, tableModels);

  // 5b. PG reserved-word identifier check
  validatePgReservedIdentifiers(program, tableModels);

  // 5c. New decorators: @polymorphic, @goType, @indexUsing
  validatePolymorphicProperties(program, tableModels);
  validateGoTypeAndIndexUsing(program, tableModels);

  // 6. Namespace, mixin, and dependency-shape validations shared with emitters
  normalizeOrmGraph(program);
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
  let versionCount = 0;
  let tenantIdCount = 0;
  let autoIncrementCount = 0;
  const columnNames = new Map<string, string>(); // columnName → propName
  const constraintNames = new Map<string, string>(); // constraintName -> decorator

  for (const prop of walkPropertiesInherited(model)) {
    // Skip navigation/array properties (relations)
    if (prop.type.kind === "Model" && isTable(program, prop.type as Model)) {
      continue;
    }
    if (prop.type.kind === "Model" && (prop.type as Model).indexer?.value?.kind === "Model") {
      continue;
    }

    if (isKey(program, prop)) {
      idCount++;
    }

    // Count @softDelete
    if (isSoftDelete(program, prop)) softDeleteCount++;

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
    if (isTenantIdColumn(program, prop)) tenantIdCount++;

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

  if (versionCount > 1) {
    reportDiagnostic(program, {
      code: "multiple-version-columns",
      target: model,
    });
  }

  if (tenantIdCount > 1) {
    reportDiagnostic(program, {
      code: "multiple-tenant-id-columns",
      target: model,
    });
  }

  if (autoIncrementCount > 1) {
    reportDiagnostic(program, {
      code: "multiple-auto-increment-columns",
      target: model,
    });
  }

  // Composite constraint column references
  validateCompositeConstraints(program, model, columnNames);

  // Model-level @@tableIndex / @@tableUnique column references
  validateModelLevelIndexes(program, model, columnNames);
}

// ─── Property-level validations ──────────────────────────────────────────────

function validatePropertyDecorators(program: Program, prop: ModelProperty): void {
  const dbType = resolveDbType(prop.type);
  const typeName = dbType ?? prop.type.kind;

  // @ignore conflicts
  if (isIgnored(program, prop)) {
    reportIgnoreConflicts(program, prop);
    return; // No further checks needed for ignored props
  }

  validateTypedDecorators(program, prop, dbType, typeName);

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
    ["softDelete", isSoftDelete(program, prop)],
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
  reportInvalidDecoratorType(dbType, isSoftDelete(program, prop), {
    allowedTypes: DATETIME_TYPES,
    report: () =>
      reportDiagnostic(program, {
        code: "soft-delete-on-non-datetime",
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

// ─── PG reserved-word identifier check ──────────────────────────────────────

function validatePgReservedIdentifiers(
  program: Program,
  tableModels: { model: Model; tableName: string }[],
): void {
  const reportedNames = new Set<string>();

  const reportOnce = (name: string, target: Model | ModelProperty, cacheKey: string): void => {
    if (!isPgReservedWord(name)) return;
    if (reportedNames.has(cacheKey)) return;
    reportedNames.add(cacheKey);
    reportDiagnostic(program, {
      code: "pg-reserved-identifier",
      target,
      format: { name },
    });
  };

  for (const { model, tableName } of tableModels) {
    reportOnce(tableName, model, `table:${tableName}`);

    for (const prop of walkPropertiesInherited(model)) {
      if (isIgnored(program, prop)) continue;

      // Skip relation/array properties that are not real columns.
      const isRelationModel = prop.type.kind === "Model" && isTable(program, prop.type as Model);
      const isRelationArray =
        prop.type.kind === "Model" && (prop.type as Model).indexer?.value?.kind === "Model";
      const isRelation = isRelationModel || isRelationArray;

      if (!isRelation) {
        const colName = getColumnName(program, prop);
        reportOnce(colName, prop, `col:${tableName}.${colName}`);
      }

      if (!isRelation && isIndex(program, prop)) {
        const indexName = getIndexName(program, prop);
        if (indexName) {
          reportOnce(indexName, prop, `idx:${indexName}`);
        }
      }

      if (!isRelation && isUnique(program, prop)) {
        const uniqueName = getUniqueName(program, prop);
        if (uniqueName) {
          reportOnce(uniqueName, prop, `uniq:${uniqueName}`);
        }
      }
    }
  }
}

// ─── Cascade on non-relation check ───────────────────────────────────────────

/** Warn on @foreignKey columns that have no index — PG never auto-creates one. */
function validateForeignKeyIndex(
  program: Program,
  tableModels: { model: Model; tableName: string }[],
): void {
  for (const { model } of tableModels) {
    for (const prop of walkPropertiesInherited(model)) {
      if (prop.type.kind === "Model") continue;
      if (!getForeignKey(program, prop)) continue;
      if (isKey(program, prop) || isUnique(program, prop) || isIndex(program, prop)) continue;
      reportDiagnostic(program, {
        code: "foreign-key-without-index",
        target: prop,
        format: { propName: prop.name },
      });
    }
  }
}

/** Check if @onDelete or @onUpdate is used on non-relation scalar properties */
function validateCascadeOnScalar(
  program: Program,
  tableModels: { model: Model; tableName: string }[],
): void {
  for (const { model } of tableModels) {
    for (const prop of walkPropertiesInherited(model)) {
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

function validateRelations(
  program: Program,
  tableModels: { model: Model; tableName: string }[],
): void {
  const oneToOneReported = new Set<string>();
  for (const { model } of tableModels) {
    for (const prop of walkPropertiesInherited(model)) {
      validateRelationProperty(program, model, prop, oneToOneReported);
    }
  }
}

function validateManyToMany(
  program: Program,
  tableModels: { model: Model; tableName: string }[],
): void {
  const tableByName = new Map<string, Model>();
  const explicitJoinConflictReported = new Set<string>();

  for (const { model, tableName } of tableModels) {
    tableByName.set(tableName, model);
  }

  for (const { model } of tableModels) {
    for (const prop of walkPropertiesInherited(model)) {
      validateManyToManyProperty(program, model, prop, tableByName, explicitJoinConflictReported);
    }
  }
}

function validateRelationProperty(
  program: Program,
  model: Model,
  prop: ModelProperty,
  oneToOneReported: Set<string>,
): void {
  const fk = getForeignKeyConfig(program, prop);
  const mappedBy = getMappedBy(program, prop);

  if (fk && prop.type.kind === "Model" && isTable(program, prop.type as Model)) {
    validateOwnedRelation(program, model, prop, prop.type as Model, fk, oneToOneReported);
  }

  if (!mappedBy) {
    return;
  }

  const arrayTarget = unwrapArrayType(prop.type);
  const targetModel = resolveMappedByTarget(program, prop, arrayTarget);

  if (!targetModel) {
    return;
  }

  const inverseProp = resolvePropertyByName(targetModel, mappedBy);
  if (!inverseProp) {
    reportDiagnostic(program, {
      code: "mapped-by-missing-property",
      target: prop,
      format: {
        propName: prop.name,
        fieldName: mappedBy,
        targetModel: targetModel.name,
      },
    });
    return;
  }

  if (!arrayTarget) {
    const inverseFk = getForeignKeyConfig(program, inverseProp);
    if (!inverseFk) {
      return;
    }

    const localProperty = resolvePropertyReference(program, targetModel, inverseFk.field);
    if (localProperty && !isRelationLocalKeyUnique(program, localProperty)) {
      reportOneToOneMissingUnique(program, prop, model.name, localProperty.name, oneToOneReported);
    }
  }
}

function validateManyToManyProperty(
  program: Program,
  model: Model,
  prop: ModelProperty,
  tableByName: Map<string, Model>,
  explicitJoinConflictReported: Set<string>,
): void {
  const joinTable = getManyToMany(program, prop);
  if (!joinTable) {
    return;
  }

  const arrayTarget = unwrapArrayType(prop.type);
  if (!arrayTarget) {
    reportDiagnostic(program, {
      code: "many-to-many-not-array",
      target: prop,
      format: { propName: prop.name, tableName: joinTable },
    });
    return;
  }

  if (!isTable(program, arrayTarget)) {
    reportDiagnostic(program, {
      code: "many-to-many-target-not-table",
      target: prop,
      format: { propName: prop.name, tableName: joinTable },
    });
    return;
  }

  reportManyToManyInverseProblems(program, model, prop, joinTable, arrayTarget);
  reportManyToManyMissingKey(program, model, prop, joinTable, arrayTarget);
  reportExplicitJoinConflict(
    program,
    model,
    prop,
    joinTable,
    arrayTarget,
    tableByName,
    explicitJoinConflictReported,
  );
}

function reportManyToManyInverseProblems(
  program: Program,
  model: Model,
  prop: ModelProperty,
  joinTable: string,
  arrayTarget: Model,
): void {
  const inverse = findInverseManyToManyDeclaration(program, model, arrayTarget);
  if (!inverse) {
    reportDiagnostic(program, {
      code: "many-to-many-missing-inverse",
      target: prop,
      format: {
        tableName: joinTable,
        modelName: model.name,
        propName: prop.name,
        targetModel: arrayTarget.name,
      },
    });
    return;
  }

  if (inverse.joinTable !== joinTable) {
    reportDiagnostic(program, {
      code: "many-to-many-conflicting-table",
      target: prop,
      format: {
        modelName: model.name,
        propName: prop.name,
        tableName: joinTable,
        targetModel: arrayTarget.name,
        targetProp: inverse.prop.name,
        otherTableName: inverse.joinTable,
      },
    });
  }
}

function reportManyToManyMissingKey(
  program: Program,
  model: Model,
  prop: ModelProperty,
  joinTable: string,
  arrayTarget: Model,
): void {
  const localKey = findPrimaryKey(program, model);
  const targetKey = findPrimaryKey(program, arrayTarget);
  if (localKey && targetKey) return;

  const missingModel = !localKey ? model.name : arrayTarget.name;
  reportDiagnostic(program, {
    code: "many-to-many-target-missing-key",
    target: prop,
    format: {
      tableName: joinTable,
      modelName: model.name,
      propName: prop.name,
      targetModel: arrayTarget.name,
      missingModel,
    },
  });
}

function reportExplicitJoinConflict(
  program: Program,
  model: Model,
  prop: ModelProperty,
  joinTable: string,
  arrayTarget: Model,
  tableByName: Map<string, Model>,
  explicitJoinConflictReported: Set<string>,
): void {
  const explicitTable = tableByName.get(joinTable);
  if (!explicitTable) {
    return;
  }

  const leftName = getTypeFullName(program, model);
  const rightName = getTypeFullName(program, arrayTarget);
  const key = buildRelationPairKey(joinTable, leftName, rightName);
  if (explicitJoinConflictReported.has(key)) {
    return;
  }

  explicitJoinConflictReported.add(key);
  reportDiagnostic(program, {
    code: "many-to-many-conflicting-explicit-table",
    target: prop,
    format: {
      tableName: joinTable,
      modelName: model.name,
      propName: prop.name,
      existingModel: explicitTable.name,
    },
  });
}

function buildRelationPairKey(joinTable: string, leftName: string, rightName: string): string {
  if (leftName <= rightName) {
    return `${joinTable}:${leftName}:${rightName}`;
  }
  return `${joinTable}:${rightName}:${leftName}`;
}

function validateOwnedRelation(
  program: Program,
  model: Model,
  relationProp: ModelProperty,
  targetModel: Model,
  fk: { field: string; target?: string },
  oneToOneReported: Set<string>,
): void {
  const localProperty = resolvePropertyReference(program, model, fk.field);
  const targetField = fk.target ?? "id";
  const targetProperty = resolvePropertyReference(program, targetModel, targetField);
  const targetFieldSuffix = fk.target ? `", "${fk.target}"` : "";

  if (!localProperty) {
    reportDiagnostic(program, {
      code: "foreign-key-local-missing",
      target: relationProp,
      format: {
        propName: relationProp.name,
        modelName: model.name,
        localField: fk.field,
        targetFieldSuffix,
      },
    });
    return;
  }

  if (!targetProperty) {
    reportDiagnostic(program, {
      code: "foreign-key-target-missing",
      target: relationProp,
      format: {
        propName: relationProp.name,
        localField: fk.field,
        targetField,
        targetModel: targetModel.name,
        targetFieldSuffix,
      },
    });
    return;
  }

  if (!arePropertyTypesCompatible(program, localProperty, targetProperty)) {
    reportDiagnostic(program, {
      code: "foreign-key-type-mismatch",
      target: relationProp,
      format: {
        propName: relationProp.name,
        localField: fk.field,
        targetFieldSuffix,
        modelName: model.name,
        resolvedLocalField: localProperty.name,
        targetModel: targetModel.name,
        resolvedTargetField: targetProperty.name,
        localType: describeComparableType(program, localProperty),
        targetType: describeComparableType(program, targetProperty),
      },
    });
  }

  const onDelete = getOnDelete(program, relationProp)
    ?.trim()
    .toUpperCase()
    .replace(/[\s_-]+/g, " ");
  if (onDelete === "SET NULL" && !localProperty.optional) {
    reportDiagnostic(program, {
      code: "foreign-key-set-null-non-nullable",
      target: relationProp,
      format: {
        propName: relationProp.name,
        localField: localProperty.name,
      },
    });
  }

  const inverseOneToOne = findInverseSingularMappedBy(
    program,
    model,
    targetModel,
    relationProp.name,
  );
  if (inverseOneToOne && !isRelationLocalKeyUnique(program, localProperty)) {
    reportOneToOneMissingUnique(
      program,
      inverseOneToOne,
      targetModel.name,
      localProperty.name,
      oneToOneReported,
    );
  }
}

// ─── Composite constraint column validation ──────────────────────────────────

function validateCompositeConstraints(
  program: Program,
  model: Model,
  columnNames: Map<string, string>,
): void {
  const validColumns = new Set(columnNames.keys());

  // Track all resolved composite columns (from composite<> type) to detect conflicts.
  const compositeFieldColumns = new Map<
    string,
    { propName: string; isUnique: boolean; isPrimary: boolean }
  >();

  // First, collect all composite type fields from properties
  for (const prop of walkPropertiesInherited(model)) {
    const propName = prop.name;
    const compositeColumns = getCompositeFields(program, prop);
    if (!compositeColumns) continue;

    const propIsUnique = isUnique(program, prop);
    const propIsPrimary = isKey(program, prop);

    for (const col of compositeColumns) {
      const resolvedCol = resolveCompositeColumnName(program, model, col);
      const existing = compositeFieldColumns.get(resolvedCol);
      if (existing) {
        // Conflict: same resolved column in multiple composite fields.
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

  // Check composite type fields reference valid columns
  for (const prop of walkPropertiesInherited(model)) {
    const propName = prop.name;
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
      const resolvedCol = resolveCompositeColumnName(program, model, col);
      if (seenColumns.has(resolvedCol)) {
        reportDiagnostic(program, {
          code: "duplicate-column-in-composite",
          target: prop,
          format: { columnName: col, propName },
        });
      }
      seenColumns.add(resolvedCol);

      // Check for non-existent column
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Check if a property has an explicit @map() decorator (vs auto-derived name) */
function hasExplicitMap(program: Program, prop: ModelProperty): boolean {
  return program.stateMap(MapKey).has(prop);
}

function findInverseSingularMappedBy(
  program: Program,
  sourceModel: Model,
  targetModel: Model,
  relationPropName: string,
): ModelProperty | undefined {
  for (const prop of walkPropertiesInherited(targetModel)) {
    if (getMappedBy(program, prop) !== relationPropName) {
      continue;
    }
    if (prop.type.kind === "Model" && prop.type === sourceModel) {
      return prop;
    }
  }
  return undefined;
}

function findInverseManyToManyDeclaration(
  program: Program,
  sourceModel: Model,
  targetModel: Model,
): { prop: ModelProperty; joinTable: string } | undefined {
  for (const prop of walkPropertiesInherited(targetModel)) {
    const joinTable = getManyToMany(program, prop);
    if (!joinTable) {
      continue;
    }

    const inverseArrayTarget = unwrapArrayType(prop.type);
    if (inverseArrayTarget === sourceModel) {
      return { prop, joinTable };
    }
  }

  return undefined;
}

function reportOneToOneMissingUnique(
  program: Program,
  target: ModelProperty,
  modelName: string,
  localField: string,
  seen: Set<string>,
): void {
  const key = `${modelName}:${target.name}:${localField}`;
  if (seen.has(key)) {
    return;
  }
  seen.add(key);
  reportDiagnostic(program, {
    code: "one-to-one-missing-unique",
    target,
    format: {
      propName: target.name,
      modelName,
      localField,
    },
  });
}

// ─── @polymorphic / @goType / @indexUsing validation ────────────────────────

function validatePolymorphicProperties(
  program: Program,
  tableModels: { model: Model; tableName: string }[],
): void {
  for (const { model } of tableModels) {
    const columnNames = new Set<string>();
    for (const prop of walkPropertiesInherited(model)) {
      if (!isIgnored(program, prop)) {
        columnNames.add(getColumnName(program, prop));
      }
    }

    for (const prop of walkPropertiesInherited(model)) {
      const config = getPolymorphicConfig(program, prop);
      if (!config) continue;

      if (config.allowedTypes.length === 0) {
        reportDiagnostic(program, {
          code: "polymorphic-empty-allowed-types",
          target: prop,
          format: { propName: prop.name },
        });
      }

      if (config.idColumn && !columnNames.has(config.idColumn)) {
        reportDiagnostic(program, {
          code: "polymorphic-column-conflict",
          target: prop,
          format: { propName: prop.name, columnName: config.idColumn },
        });
      }
    }
  }
}

function validateGoTypeAndIndexUsing(
  program: Program,
  tableModels: { model: Model; tableName: string }[],
): void {
  for (const { model } of tableModels) {
    for (const prop of walkPropertiesInherited(model)) {
      const goType = getGoType(program, prop);
      if (goType && (!goType.importPath || !goType.typeName)) {
        reportDiagnostic(program, {
          code: "go-type-malformed",
          target: prop,
          format: { propName: prop.name, value: goType.raw },
        });
      }

      const method = getIndexUsing(program, prop);
      if (method && !isIndex(program, prop) && !isUnique(program, prop) && !isKey(program, prop)) {
        reportDiagnostic(program, {
          code: "index-using-on-non-index",
          target: prop,
          format: { propName: prop.name, method },
        });
      }
    }
  }
}
