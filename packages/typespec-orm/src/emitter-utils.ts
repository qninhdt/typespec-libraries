/**
 * Shared emitter utilities.
 *
 * Code that is identical (or nearly so) between the GORM and SQLModel emitters
 * lives here so each emitter can import it instead of duplicating it.
 */

import type { Enum, Model, ModelProperty, Program } from "@typespec/compiler";
import type { EnumMemberInfo, ResolvedRelation } from "./helpers.js";
import { getPropertyEnum, isIgnored, resolveRelation } from "./helpers.js";

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
 * Used by GORM tag builders to avoid emitting `not null;not null`.
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
 * previously duplicated across the GORM and SQLModel emitters.
 */
export function classifyProperties(program: Program, model: Model): ClassifiedProperties {
  const enumTypes = new Map<string, EnumMemberInfo[]>();
  const ignored: ClassifiedProperty[] = [];
  const relations: ClassifiedRelation[] = [];
  const fields: ClassifiedProperty[] = [];

  for (const [, prop] of model.properties) {
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

    // Regular DB-mapped field
    fields.push({ prop, enumInfo });
  }

  return { enumTypes, ignored, relations, fields };
}
