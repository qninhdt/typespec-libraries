import {
  walkPropertiesInherited,
  type Model,
  type ModelProperty,
  type Program,
} from "@typespec/compiler";
import { reportDiagnostic } from "./lib.js";
import {
  arePropertyTypesCompatible,
  describeComparableType,
  isTable,
  isKey,
  isUnique,
  isIndex,
  getForeignKey,
  getForeignKeyConfig,
  getManyToMany,
  getOnDelete,
  getOnUpdate,
  getMappedBy,
  getTypeFullName,
  isRelationLocalKeyUnique,
  resolvePropertyReference,
  resolvePropertyByName,
  resolveMappedByTarget,
  unwrapArrayType,
  findPrimaryKey,
} from "./helpers.js";

// ─── Cascade on non-relation check ───────────────────────────────────────────

/** Warn on @foreignKey columns that have no index — PG never auto-creates one. */
export function validateForeignKeyIndex(
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
export function validateCascadeOnScalar(
  program: Program,
  tableModels: { model: Model; tableName: string }[],
): void {
  for (const { model } of tableModels) {
    for (const prop of walkPropertiesInherited(model)) {
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

// ─── Direct relations ────────────────────────────────────────────────────────

export function validateRelations(
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

// ─── Many-to-many ────────────────────────────────────────────────────────────

export function validateManyToMany(
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
