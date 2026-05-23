export {
  findPrimaryKey,
  unwrapArrayType,
  resolvePropertyReference,
  resolvePropertyByName,
  describeComparableType,
  arePropertyTypesCompatible,
  isRelationLocalKeyUnique,
} from "./relations-properties.js";

export {
  findInverseMappedBy,
  deriveManyToManyJoinColumnName,
  collectManyToManyAssociations,
  resolveRelation,
  resolveMappedByTarget,
} from "./relations-resolution.js";

export type { ResolvedRelation, ManyToManyAssociation } from "./relations-resolution.js";
