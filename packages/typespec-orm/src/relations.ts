/**
 * Relation resolution: derives `ResolvedRelation` graphs from `@foreignKey`,
 * `@mappedBy`, and `@manyToMany` decorators. Handles direct, inverse, and
 * many-to-many flavours plus cross-property comparability checks.
 */

import type { Model, ModelProperty, Namespace, Program, Type } from "@typespec/compiler";
import { walkPropertiesInherited } from "@typespec/compiler";

import type { ModelIndexSpec } from "./decorators.js";
import { ModelUniquesKey } from "./lib.js";
import { camelToSnake } from "./naming.js";
import { resolveDbType } from "./scalar-resolution.js";
import {
  getColumnName,
  getForeignKeyConfig,
  getMappedBy,
  getManyToMany,
  getOnDelete,
  getOnUpdate,
  getTableName,
  getTypeFullName,
  isKey,
  isTable,
  isUnique,
  type ForeignKeyConfig,
} from "./state-accessors.js";

export interface ResolvedRelation {
  /** Relation kind */
  kind: "many-to-one" | "one-to-many" | "one-to-one" | "many-to-many";
  /** The referenced Model type */
  targetModel: Model;
  /** Table name of the target model */
  targetTable: string;
  /** The concrete FK-bearing property involved in this relation */
  localProperty: ModelProperty;
  /** The referenced property on the target model */
  targetProperty: ModelProperty;
  /** FK column name (snake_case) */
  fkColumnName: string;
  /** Column referenced in target table (default: "id") */
  fkTargetColumn: string;
  /** DB type of the FK (resolved from target PK type, e.g. "uuid") */
  fkDbType: string | undefined;
  /** ON DELETE action */
  onDelete?: string;
  /** ON UPDATE action */
  onUpdate?: string;
  /** For one-to-many/many-to-one: snake_case inverse relation name (for SQLModel back_populates) */
  backPopulates?: string;
  /** Join table name for many-to-many shorthand */
  joinTable?: string;
}

export interface ManyToManyAssociation {
  tableName: string;
  leftModel: Model;
  rightModel: Model;
  leftProperty: ModelProperty;
  rightProperty: ModelProperty;
  leftKey: ModelProperty;
  rightKey: ModelProperty;
  leftJoinColumn: string;
  rightJoinColumn: string;
}

interface ResolvedForeignKeyReference {
  targetModel: Model;
  targetTable: string;
  localProperty: ModelProperty;
  targetProperty: ModelProperty;
  localColumnName: string;
  targetColumnName: string;
  fkDbType: string | undefined;
}

/**
 * Find the primary key property of a model.
 * Checks for @key (TypeSpec built-in)
 */
export function findPrimaryKey(program: Program, model: Model): ModelProperty | undefined {
  for (const prop of walkPropertiesInherited(model)) {
    if (isKey(program, prop)) return prop;
  }
  return undefined;
}

/**
 * Unwrap an array type (Model[]) and return the inner element Model.
 * TypeSpec arrays are Models with an indexer whose value is the element type.
 * Returns undefined if not an array of Models.
 */
export function unwrapArrayType(type: Type): Model | undefined {
  if (type.kind !== "Model") return undefined;
  if (!type.indexer) return undefined;
  const elementType = type.indexer.value;
  if (elementType.kind === "Model") return elementType;
  return undefined;
}

interface PropertyReferenceMaps {
  byName: Map<string, ModelProperty>;
  byColumn: Map<string, ModelProperty>;
}

const propertyReferenceCache = new WeakMap<
  Program,
  WeakMap<Model, PropertyReferenceMaps>
>();

function getPropertyReferenceMaps(program: Program, model: Model): PropertyReferenceMaps {
  let perProgram = propertyReferenceCache.get(program);
  if (!perProgram) {
    perProgram = new WeakMap<Model, PropertyReferenceMaps>();
    propertyReferenceCache.set(program, perProgram);
  }
  let cached = perProgram.get(model);
  if (cached) return cached;
  const byName = new Map<string, ModelProperty>();
  const byColumn = new Map<string, ModelProperty>();
  for (const prop of walkPropertiesInherited(model)) {
    if (!byName.has(prop.name)) byName.set(prop.name, prop);
    const columnName = getColumnName(program, prop);
    if (columnName && !byColumn.has(columnName)) byColumn.set(columnName, prop);
  }
  cached = { byName, byColumn };
  perProgram.set(model, cached);
  return cached;
}

export function resolvePropertyReference(
  program: Program,
  model: Model,
  reference: string,
): ModelProperty | undefined {
  const maps = getPropertyReferenceMaps(program, model);
  return maps.byName.get(reference) ?? maps.byColumn.get(reference);
}

export function resolvePropertyByName(model: Model, name: string): ModelProperty | undefined {
  for (const prop of walkPropertiesInherited(model)) {
    if (prop.name === name) return prop;
  }
  return undefined;
}

function getComparableTypeId(program: Program, type: Type): string | undefined {
  if (type.kind === "ModelProperty") {
    return getComparableTypeId(program, type.type);
  }
  if (type.kind === "Enum") {
    return `enum:${getTypeFullName(program, type)}`;
  }
  if (type.kind === "Scalar") {
    return `scalar:${resolveDbType(type) ?? getTypeFullName(program, type)}`;
  }
  return undefined;
}

export function describeComparableType(program: Program, prop: ModelProperty): string {
  if (prop.type.kind === "ModelProperty") {
    return describeComparableType(program, prop.type);
  }
  if (prop.type.kind === "Enum") {
    return getTypeFullName(program, prop.type);
  }
  if ("name" in prop.type && typeof prop.type.name === "string") {
    return (
      resolveDbType(prop.type) ??
      getTypeFullName(program, prop.type as { name?: string; namespace?: Namespace }) ??
      prop.type.kind
    );
  }
  return resolveDbType(prop.type) ?? prop.type.kind;
}

export function arePropertyTypesCompatible(
  program: Program,
  left: ModelProperty,
  right: ModelProperty,
): boolean {
  return getComparableTypeId(program, left.type) === getComparableTypeId(program, right.type);
}

export function isRelationLocalKeyUnique(program: Program, prop: ModelProperty): boolean {
  if (isKey(program, prop) || isUnique(program, prop)) return true;
  const owner = prop.model;
  if (!owner) return false;
  const columnName = getColumnName(program, prop);
  const uniques =
    (program.stateMap(ModelUniquesKey).get(owner) as ModelIndexSpec[] | undefined) ?? [];
  for (const spec of uniques) {
    if (spec.columns.length !== 1) continue;
    const only = spec.columns[0];
    if (only === prop.name || only === columnName) return true;
  }
  return false;
}

function isModelReferenceTo(type: Type, expected: Model): boolean {
  return type.kind === "Model" ? type === expected : false;
}

export function findInverseMappedBy(
  program: Program,
  parentModel: Model,
  targetModel: Model,
  relationPropName: string,
): ModelProperty | undefined {
  for (const prop of walkPropertiesInherited(targetModel)) {
    if (getMappedBy(program, prop) !== relationPropName) continue;
    const arrayElement = unwrapArrayType(prop.type);
    if (arrayElement === parentModel || isModelReferenceTo(prop.type, parentModel)) {
      return prop;
    }
  }
  return undefined;
}

function resolveRelationProperties(
  program: Program,
  parentModel: Model,
  targetModel: Model,
  fk: ForeignKeyConfig,
): { localProperty: ModelProperty; targetProperty: ModelProperty } | undefined {
  const localProperty = resolvePropertyReference(program, parentModel, fk.field);
  if (!localProperty) {
    return undefined;
  }

  const targetProperty = resolvePropertyReference(program, targetModel, fk.target ?? "id");
  if (!targetProperty) {
    return undefined;
  }

  return { localProperty, targetProperty };
}

function resolveOwnedRelationReference(
  program: Program,
  relationProp: ModelProperty,
  parentModel: Model,
  targetModel: Model,
): ResolvedForeignKeyReference | undefined {
  const fk = getForeignKeyConfig(program, relationProp);
  if (!fk) return undefined;
  const resolved = resolveRelationProperties(program, parentModel, targetModel, fk);
  if (!resolved) return undefined;
  const { localProperty, targetProperty } = resolved;

  return {
    targetModel,
    targetTable: getTableName(program, targetModel),
    localProperty,
    targetProperty,
    localColumnName: getColumnName(program, localProperty),
    targetColumnName: getColumnName(program, targetProperty),
    fkDbType: resolveDbType(targetProperty.type),
  };
}

function findInverseManyToMany(
  program: Program,
  parentModel: Model,
  targetModel: Model,
  sourceProp: ModelProperty,
): { prop: ModelProperty; tableName: string } | undefined {
  const joinTable = getManyToMany(program, sourceProp);
  if (!joinTable) return undefined;

  for (const prop of walkPropertiesInherited(targetModel)) {
    const inverseTable = getManyToMany(program, prop);
    if (!inverseTable) continue;
    const inverseTarget = unwrapArrayType(prop.type);
    if (inverseTarget !== parentModel) continue;
    if (inverseTable !== joinTable) continue;
    return { prop, tableName: inverseTable };
  }

  return undefined;
}

export function deriveManyToManyJoinColumnName(
  program: Program,
  model: Model,
  keyProperty: ModelProperty,
): string {
  return `${camelToSnake(model.name)}_${getColumnName(program, keyProperty)}`;
}

export function collectManyToManyAssociations(
  program: Program,
  models: Iterable<Model>,
): ManyToManyAssociation[] {
  const associations = new Map<string, ManyToManyAssociation>();

  for (const model of models) {
    for (const prop of walkPropertiesInherited(model)) {
      const association = buildManyToManyAssociation(program, model, prop);
      if (!association) continue;
      if (associations.has(association.pairKey)) continue;

      associations.set(association.pairKey, association.value);
    }
  }

  return [...associations.values()].sort((a, b) => a.tableName.localeCompare(b.tableName));
}

function buildManyToManyAssociation(
  program: Program,
  model: Model,
  prop: ModelProperty,
): { pairKey: string; value: ManyToManyAssociation } | undefined {
  const joinTable = getManyToMany(program, prop);
  if (!joinTable) return undefined;

  const targetModel = unwrapArrayType(prop.type);
  if (!targetModel || !isTable(program, targetModel)) return undefined;

  const inverse = findInverseManyToMany(program, model, targetModel, prop);
  if (!inverse) return undefined;

  const leftKey = findPrimaryKey(program, model);
  const rightKey = findPrimaryKey(program, targetModel);
  if (!leftKey || !rightKey) return undefined;

  const leftName = getTypeFullName(program, model);
  const rightName = getTypeFullName(program, targetModel);
  const [pairKey, leftFirst] = buildAssociationOrdering(joinTable, leftName, rightName);
  const leftModel = leftFirst ? model : targetModel;
  const rightModel = leftFirst ? targetModel : model;
  const leftProperty = leftFirst ? prop : inverse.prop;
  const rightProperty = leftFirst ? inverse.prop : prop;
  const leftPk = leftFirst ? leftKey : rightKey;
  const rightPk = leftFirst ? rightKey : leftKey;

  return {
    pairKey,
    value: {
      tableName: joinTable,
      leftModel,
      rightModel,
      leftProperty,
      rightProperty,
      leftKey: leftPk,
      rightKey: rightPk,
      leftJoinColumn: deriveManyToManyJoinColumnName(program, leftModel, leftPk),
      rightJoinColumn: deriveManyToManyJoinColumnName(program, rightModel, rightPk),
    },
  };
}

function buildAssociationOrdering(
  joinTable: string,
  leftName: string,
  rightName: string,
): [string, boolean] {
  const leftFirst = leftName <= rightName;
  const pairKey = leftFirst
    ? `${joinTable}:${leftName}:${rightName}`
    : `${joinTable}:${rightName}:${leftName}`;
  return [pairKey, leftFirst];
}

/**
 * Resolve a relation from a model property.
 *
 * Relations must be explicitly declared:
 * - many-to-one: `@foreignKey("column_name")` on the Model reference property
 * - one-to-many: `@mappedBy("inverse_property")` on the array property
 *
 * Returns undefined if the property is not a valid relation.
 */
export function resolveRelation(
  program: Program,
  prop: ModelProperty,
  parentModel: Model,
): ResolvedRelation | undefined {
  const onDelete = getOnDelete(program, prop);
  const onUpdate = getOnUpdate(program, prop);
  const explicitFk = getForeignKeyConfig(program, prop);
  const explicitMappedBy = getMappedBy(program, prop);
  const explicitManyToMany = getManyToMany(program, prop);

  const directRelation = resolveDirectRelation(
    program,
    prop,
    parentModel,
    explicitFk,
    onDelete,
    onUpdate,
  );
  if (directRelation) {
    return directRelation;
  }

  const arrayElement = unwrapArrayType(prop.type);

  const manyToManyRelation = resolveManyToManyRelation(
    program,
    prop,
    parentModel,
    arrayElement,
    explicitManyToMany,
  );
  if (manyToManyRelation) {
    return manyToManyRelation;
  }

  // Case 3: @mappedBy on array or singular model reference -> inverse collection / has-one
  const mappedByTarget = resolveMappedByTarget(program, prop, arrayElement);

  return resolveMappedByRelation({
    program,
    parentModel,
    arrayElement,
    mappedByTarget,
    explicitMappedBy,
    onDelete,
    onUpdate,
  });
}

function resolveDirectRelation(
  program: Program,
  prop: ModelProperty,
  parentModel: Model,
  explicitFk: ForeignKeyConfig | undefined,
  onDelete: string | undefined,
  onUpdate: string | undefined,
): ResolvedRelation | undefined {
  if (prop.type.kind !== "Model" || !isTable(program, prop.type) || !explicitFk) {
    return undefined;
  }

  const targetModel = prop.type;
  const resolved = resolveOwnedRelationReference(program, prop, parentModel, targetModel);
  if (!resolved) {
    return undefined;
  }

  const kind = isRelationLocalKeyUnique(program, resolved.localProperty)
    ? "one-to-one"
    : "many-to-one";
  const inverseRef = findInverseMappedBy(program, parentModel, targetModel, prop.name);

  return {
    kind,
    ...resolved,
    fkColumnName: resolved.localColumnName,
    fkTargetColumn: resolved.targetColumnName,
    onDelete,
    onUpdate,
    backPopulates: inverseRef ? camelToSnake(inverseRef.name) : undefined,
  };
}

function resolveManyToManyRelation(
  program: Program,
  prop: ModelProperty,
  parentModel: Model,
  arrayElement: Model | undefined,
  explicitManyToMany: string | undefined,
): ResolvedRelation | undefined {
  if (!arrayElement || !isTable(program, arrayElement) || !explicitManyToMany) {
    return undefined;
  }

  const inverse = findInverseManyToMany(program, parentModel, arrayElement, prop);
  if (!inverse) {
    return undefined;
  }

  const localPk = findPrimaryKey(program, parentModel);
  const targetPk = findPrimaryKey(program, arrayElement);
  if (!localPk || !targetPk) {
    return undefined;
  }

  return {
    kind: "many-to-many",
    targetModel: arrayElement,
    targetTable: getTableName(program, arrayElement),
    localProperty: localPk,
    targetProperty: targetPk,
    fkColumnName: getColumnName(program, localPk),
    fkTargetColumn: getColumnName(program, targetPk),
    fkDbType: resolveDbType(targetPk.type),
    backPopulates: camelToSnake(inverse.prop.name),
    joinTable: explicitManyToMany,
  };
}

function resolveMappedByRelation(context: {
  program: Program;
  parentModel: Model;
  arrayElement: Model | undefined;
  mappedByTarget: Model | undefined;
  explicitMappedBy: string | undefined;
  onDelete: string | undefined;
  onUpdate: string | undefined;
}): ResolvedRelation | undefined {
  const {
    program,
    parentModel,
    arrayElement,
    mappedByTarget,
    explicitMappedBy,
    onDelete,
    onUpdate,
  } = context;
  if (!mappedByTarget || !explicitMappedBy) {
    return undefined;
  }

  const targetProp = resolvePropertyByName(mappedByTarget, explicitMappedBy);
  if (!targetProp) {
    return undefined;
  }

  const resolved = resolveOwnedRelationReference(program, targetProp, mappedByTarget, parentModel);
  if (!resolved) {
    return undefined;
  }

  return {
    kind: arrayElement ? "one-to-many" : "one-to-one",
    targetModel: mappedByTarget,
    targetTable: getTableName(program, mappedByTarget),
    localProperty: resolved.localProperty,
    targetProperty: resolved.targetProperty,
    fkColumnName: resolved.localColumnName,
    fkTargetColumn: resolved.targetColumnName,
    fkDbType: resolved.fkDbType,
    onDelete: getOnDelete(program, targetProp) ?? onDelete,
    onUpdate: getOnUpdate(program, targetProp) ?? onUpdate,
    backPopulates: explicitMappedBy,
  };
}

export function resolveMappedByTarget(
  program: Program,
  prop: ModelProperty,
  arrayElement: Model | undefined,
): Model | undefined {
  if (arrayElement && isTable(program, arrayElement)) {
    return arrayElement;
  }

  if (prop.type.kind === "Model" && isTable(program, prop.type)) {
    return prop.type;
  }

  return undefined;
}
