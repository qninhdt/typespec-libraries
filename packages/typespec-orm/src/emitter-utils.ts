/**
 * Shared emitter utilities.
 *
 * Code that is identical (or nearly so) between the Ent and SQLModel emitters
 * lives here so each emitter can import it instead of duplicating it.
 */

import {
  walkPropertiesInherited,
  type Enum,
  type Model,
  type ModelProperty,
  type Program,
} from "@typespec/compiler";
import type { EnumMemberInfo, ResolvedRelation } from "./helpers.js";
import {
  getCompositeFields,
  getColumnName,
  getForeignKeyConfig,
  getManyToMany,
  getMappedBy,
  getPropertyEnum,
  resolvePropertyReference,
  isIgnored,
  isKey,
  isUnique,
  camelToSnake,
  getModelOwnProperties,
  resolveRelation,
} from "./helpers.js";
import { truncatePgIdentifier } from "./identifier-policy.js";
import { ModelIndexesKey, ModelUniquesKey } from "./lib.js";
import type { ModelIndexSpec } from "./decorators.js";

// ─── Constants ───────────────────────────────────────────────────────────────

/** Numeric DB types - used by both emitters for range-validation and zero-value checks. */
export const NUMERIC_TYPES: ReadonlySet<string> = new Set([
  "int8",
  "int16",
  "int32",
  "int64",
  "uint8",
  "uint16",
  "uint32",
  "uint64",
  "float32",
  "float64",
  "decimal",
  "serial",
  "bigserial",
]);

// ─── Utilities ───────────────────────────────────────────────────────────────

/**
 * Remove duplicate string entries while preserving insertion order.
 * Used by Ent tag builders to avoid emitting `not null;not null`.
 */
export function deduplicateParts(parts: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of parts) {
    if (!seen.has(part)) {
      seen.add(part);
      result.push(part);
    }
  }
  return result;
}

// ─── Composite field collection ──────────────────────────────────────────────

/** Metadata for a composite index/unique/primary constraint. */
export interface CompositeTypeField {
  /** Generated constraint name (e.g. "users_name_email_idx") */
  name: string;
  /** Database column names resolved from TypeSpec property or column references. */
  columns: string[];
  /** Whether this is a unique constraint */
  isUnique: boolean;
  /** Whether this is a primary key constraint */
  isPrimary: boolean;
}

/**
 * Collect composite type fields from a model's properties.
 *
 * Scans for `composite<col1, col2, ...>` typed properties and generates
 * constraint names in the format `[tableName]_[col1]_[col2]_..._[suffix]`
 * where suffix is "pk", "unique", or "idx".
 *
 * Previously duplicated across Ent and SQLModel emitters.
 */
export function collectCompositeTypeFields(
  program: Program,
  model: Model,
  tableName: string,
): CompositeTypeField[] {
  const result: CompositeTypeField[] = [];
  for (const prop of walkPropertiesInherited(model)) {
    const columns = getCompositeFields(program, prop);
    if (columns) {
      let suffix = "idx";
      if (isKey(program, prop)) {
        suffix = "pk";
      } else if (isUnique(program, prop)) {
        suffix = "unique";
      }
      const resolvedColumns = columns.map((column) =>
        resolveCompositeColumnName(program, model, column),
      );
      const snakeColumns = resolvedColumns.map((column) => camelToSnake(column));
      const generatedName = truncatePgIdentifier(
        [tableName, ...snakeColumns, suffix].join("_"),
      );
      result.push({
        name: generatedName,
        columns: resolvedColumns,
        isUnique: isUnique(program, prop),
        isPrimary: isKey(program, prop),
      });
    }
  }

  for (const spec of (program.stateMap(ModelIndexesKey).get(model) as ModelIndexSpec[] | undefined) ?? []) {
    const resolved = spec.columns.map((c) => resolveCompositeColumnName(program, model, c));
    const snake = resolved.map((c) => camelToSnake(c));
    const name = truncatePgIdentifier(
      spec.name ?? [tableName, ...snake, "idx"].join("_"),
    );
    result.push({ name, columns: resolved, isUnique: false, isPrimary: false });
  }

  for (const spec of (program.stateMap(ModelUniquesKey).get(model) as ModelIndexSpec[] | undefined) ?? []) {
    const resolved = spec.columns.map((c) => resolveCompositeColumnName(program, model, c));
    const snake = resolved.map((c) => camelToSnake(c));
    const name = truncatePgIdentifier(
      spec.name ?? [tableName, ...snake, "unique"].join("_"),
    );
    result.push({ name, columns: resolved, isUnique: true, isPrimary: false });
  }

  return result;
}

export function resolveCompositeColumnName(
  program: Program,
  model: Model,
  reference: string,
): string {
  const property = resolvePropertyReference(program, model, reference);
  return property ? getColumnName(program, property) : reference;
}

/**
 * Build a set of column names that are part of composite unique constraints.
 * Used to skip standalone unique=True on fields already covered by __table_args__.
 */
export function buildCompositeUniqueColumns(
  compositeTypeFields: CompositeTypeField[],
): Set<string> {
  const result = new Set<string>();
  for (const ct of compositeTypeFields) {
    if (ct.isUnique) {
      for (const col of ct.columns) {
        result.add(col);
      }
    }
  }
  return result;
}

// ─── Property classification ─────────────────────────────────────────────────

/** A property paired with its enum info (if any). */
export interface ClassifiedProperty {
  prop: ModelProperty;
  enumInfo: { enumType: Enum; members: EnumMemberInfo[] } | undefined;
}

/** A relation property with its resolved relation metadata. */
export interface ClassifiedRelation extends ClassifiedProperty {
  resolved: ResolvedRelation;
}

/**
 * Result of scanning a model's properties.
 *
 * Both emitters iterate every property and bucket it into one of three
 * categories (ignored / relation / regular field).  This helper performs
 * that classification once, collecting enum definitions along the way.
 */
export interface ClassifiedProperties {
  /** Distinct enum types encountered (enumName → members). */
  enumTypes: Map<string, EnumMemberInfo[]>;
  /** Properties decorated with `@ignore`. */
  ignored: ClassifiedProperty[];
  /** Properties that resolve to a relation (with autoInjectFk flag, etc.). */
  relations: ClassifiedRelation[];
  /** Regular (non-ignored, non-relation) properties. */
  fields: ClassifiedProperty[];
}

/**
 * Classify every property of `model` into ignored / relation / field buckets.
 *
 * This is the single source-of-truth for the property-scan loop that was
 * previously duplicated across the Ent and SQLModel emitters.
 */
export function classifyProperties(
  program: Program,
  model: Model,
  options?: { ownPropertiesOnly?: boolean },
): ClassifiedProperties {
  const enumTypes = new Map<string, EnumMemberInfo[]>();
  const ignored: ClassifiedProperty[] = [];
  const relations: ClassifiedRelation[] = [];
  const fields: ClassifiedProperty[] = [];

  const properties = options?.ownPropertiesOnly
    ? getModelOwnProperties(model)
    : walkPropertiesInherited(model);
  for (const prop of properties) {
    // Collect enum types for code generation
    const enumInfo = getPropertyEnum(prop);
    if (enumInfo && !enumTypes.has(enumInfo.enumType.name)) {
      enumTypes.set(enumInfo.enumType.name, enumInfo.members);
    }

    // Ignored properties → language-specific "excluded from DB" annotation
    if (isIgnored(program, prop)) {
      ignored.push({ prop, enumInfo });
      continue;
    }

    // Relation navigation properties
    const resolved = resolveRelation(program, prop, model);
    if (resolved) {
      relations.push({ prop, enumInfo, resolved });
      continue;
    }

    if (
      getForeignKeyConfig(program, prop) ||
      getMappedBy(program, prop) ||
      getManyToMany(program, prop)
    ) {
      continue;
    }

    // Regular DB-mapped field
    fields.push({ prop, enumInfo });
  }

  return { enumTypes, ignored, relations, fields };
}
