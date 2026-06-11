/**
 * PyRelationField -Functions for SQLModel relation field generation.
 *
 * Returns plain strings. Called imperatively by PyModel.
 */

import type { Model, ModelProperty, Program } from "@typespec/compiler";
import { walkPropertiesInherited } from "@typespec/compiler";
import type { ResolvedRelation } from "@qninhdt/typespec-orm";
import { camelToSnake, getDoc, getManyToMany, getMappedBy } from "@qninhdt/typespec-orm";
import { reportDiagnostic } from "../lib.js";
import { FOUR_SPACES } from "./PyConstants.js";

/**
 * `mappedBy` index: outer key is the inverse target model, inner key is the
 * `mappedBy` value (i.e. the source property's name). Built once per emit and
 * shared across `generateRelationField` calls so we don't re-walk the same
 * model's properties for every relation.
 */
export type MappedByIndex = ReadonlyMap<Model, ReadonlyMap<string, ModelProperty>>;

export function buildMappedByIndex(program: Program, models: Iterable<Model>): MappedByIndex {
  const index = new Map<Model, Map<string, ModelProperty>>();
  for (const model of models) {
    if (index.has(model)) continue;
    const inner = new Map<string, ModelProperty>();
    for (const prop of walkPropertiesInherited(model)) {
      const mappedBy = getMappedBy(program, prop);
      if (mappedBy && !inner.has(mappedBy)) {
        inner.set(mappedBy, prop);
      }
    }
    index.set(model, inner);
  }
  return index;
}

function countNavRelationsToTarget(fkBearingModel: Model, parentModel: Model): number {
  let count = 0;
  for (const candidate of walkPropertiesInherited(fkBearingModel)) {
    if (candidate.type.kind === "Model" && candidate.type === parentModel) {
      count++;
    }
  }
  return count;
}

/**
 * Build a `foreign_keys=` argument value when the FK-bearing model has more
 * than one FK pointing at the same parent. Without this, SQLAlchemy raises
 * `AmbiguousForeignKeysError` at configure time.
 */
function resolveForeignKeysArg(prop: ModelProperty, rel: ResolvedRelation): string | undefined {
  if (rel.kind === "many-to-many") return undefined;

  // M-1: FK is on prop.model pointing to rel.targetModel.
  // 1-M: FK is on rel.localProperty.model pointing to prop.model.
  let fkBearingModel: Model;
  let parentModel: Model;
  if (rel.kind === "many-to-one" || rel.kind === "one-to-one") {
    fkBearingModel = (prop.model as Model | undefined) ?? rel.localProperty.model!;
    parentModel = rel.targetModel;
  } else {
    fkBearingModel = rel.localProperty.model!;
    parentModel = (prop.model as Model | undefined) ?? rel.targetModel;
  }

  if (countNavRelationsToTarget(fkBearingModel, parentModel) <= 1) return undefined;

  // SQLAlchemy resolves `<ClassName>.<attr>` against the mapper registry; our
  // emitter mints python field names equal to the column name (camelToSnake),
  // so `<FkBearingClass>.<fkColumnName>` is the right reference.
  return `${fkBearingModel.name}.${rel.fkColumnName}`;
}

function deriveCascadeKwargs(rel: ResolvedRelation): string[] {
  const kwargs: string[] = [];
  const onDelete = (rel.onDelete ?? "").toLowerCase();
  // Only the collection / non-FK side benefits from passive_deletes; without
  // it ORM session.delete() will load children and issue per-row deletes,
  // bypassing the DB-level CASCADE we already emitted on the FK.
  if (rel.kind === "one-to-many" || rel.kind === "many-to-many") {
    if (onDelete === "cascade" || onDelete === "set null" || onDelete === "set default") {
      kwargs.push(`"passive_deletes": True`);
    }
    if (onDelete === "cascade") {
      kwargs.push(`"cascade": "all, delete"`);
    }
  }
  return kwargs;
}

function deriveInverseBackPopulates(
  program: Program,
  prop: ModelProperty,
  rel: ResolvedRelation,
  mappedByIndex: MappedByIndex | undefined,
): string | undefined {
  if (rel.kind === "many-to-one" || rel.kind === "one-to-one") {
    const inverse = mappedByIndex?.get(rel.targetModel)?.get(prop.name);
    return inverse ? camelToSnake(inverse.name) : undefined;
  }
  if (rel.kind === "many-to-many") {
    const localJoin = getManyToMany(program, prop);
    if (!localJoin) return undefined;
    for (const candidate of walkPropertiesInherited(rel.targetModel)) {
      if (candidate === prop) continue;
      if (getManyToMany(program, candidate) === localJoin) {
        return camelToSnake(candidate.name);
      }
    }
  }
  return undefined;
}

/**
 * Generate a SQLModel Relationship() for a navigation property.
 * Returns both the field code and the target model name for imports.
 */
export function generateRelationField(
  program: Program,
  prop: ModelProperty,
  rel: ResolvedRelation,
  manyToManySecondary?: string,
  mappedByIndex?: MappedByIndex,
): { field: string; targetModel: Model } {
  const pyFieldName = camelToSnake(prop.name);
  const targetModelName = rel.targetModel.name;
  const pyRefType = targetModelName;

  const isMany = rel.kind === "one-to-many" || rel.kind === "many-to-many";
  const pyType = isMany ? `list[${pyRefType}]` : `${pyRefType} | None`;

  const relArgs: string[] = [];

  const resolvedBackPopulates =
    rel.backPopulates ?? deriveInverseBackPopulates(program, prop, rel, mappedByIndex);

  if (resolvedBackPopulates) {
    relArgs.push(`back_populates="${resolvedBackPopulates}"`);
  }

  if (rel.kind === "one-to-many" && !resolvedBackPopulates) {
    reportDiagnostic(program, {
      code: "missing-back-reference",
      format: {
        propName: prop.name,
        modelName: (prop.model as Model)?.name ?? "<unknown>",
        targetModel: rel.targetModel.name,
      },
      target: prop,
    });
  }

  const isSelfRef =
    (rel.kind === "many-to-one" || rel.kind === "one-to-one") && prop.model === rel.targetModel;

  const doc = getDoc(program, prop);
  const docComment = doc ? `${FOUR_SPACES}# ${doc}\n` : "";

  // For self-referential relationships:
  // 1. Use remote_side pointing to PK (id)
  // 2. Use string quotes in type annotation for forward reference
  if (isSelfRef) {
    relArgs.push(
      `sa_relationship_kwargs={"remote_side": "${rel.targetModel.name}.${rel.targetProperty.name}"}`,
    );
    return {
      field: `${docComment}${FOUR_SPACES}${pyFieldName}: ${pyType} = Relationship(${relArgs.join(", ")})\n`,
      targetModel: rel.targetModel,
    };
  }

  // Track sa_relationship_kwargs for merging
  const saRelKwArgs: string[] = [];

  if (rel.kind === "many-to-many" && manyToManySecondary) {
    saRelKwArgs.push(`"secondary": ${manyToManySecondary}`);
  }

  const fkArg = resolveForeignKeysArg(prop, rel);
  if (fkArg) {
    saRelKwArgs.push(`"foreign_keys": "${fkArg}"`);
  }

  saRelKwArgs.push(...deriveCascadeKwargs(rel));

  if (saRelKwArgs.length > 0) {
    relArgs.push(`sa_relationship_kwargs={${saRelKwArgs.join(", ")}}`);
  }

  const field = `${docComment}${FOUR_SPACES}${pyFieldName}: ${pyType} = Relationship(${relArgs.join(", ")})\n`;
  return { field, targetModel: rel.targetModel };
}
