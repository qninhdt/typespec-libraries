import type { Model, ModelProperty, Program } from "@typespec/compiler";
import { walkPropertiesInherited } from "@typespec/compiler";
import { isIgnored as isOrmIgnored } from "@qninhdt/typespec-orm";
import { isProtoIgnored, getProtoFieldName, getProtoFieldNumber } from "../state-accessors.js";
import { camelToProtoSnake } from "../writer/snake-case.js";
import type { EntityFieldRequest } from "../allocator/reconcile.js";

/**
 * One proto-emittable property of an `@entity` model, paired with its resolved
 * proto field name (the allocator key).
 */
export interface EntityProtoField {
  prop: ModelProperty;
  /** snake_case (or `@rename`) proto field name — also the allocator key. */
  protoName: string;
  /** Explicit `@field(N)` pin if the author supplied one. */
  pinned?: number;
}

/**
 * Collect the proto-emittable fields of an `@entity` model in declaration
 * order. Mixin columns are auto-included (validation answer V2) because
 * `walkPropertiesInherited` surfaces them. Drops:
 *
 * - proto-side `@Openlet.Proto.ignore` properties (and reserves their number
 *   via the allocator — handled by the caller).
 * - orm-side `@Qninhdt.Orm.ignore` properties — these are ORM-only and never
 *   had a proto representation, so they're simply skipped (no reservation).
 *
 * Relation navigation properties are NOT proto fields; they carry foreign-key
 * metadata on scalar columns instead, so we only keep properties whose type
 * resolves to a scalar / model / enum (the resolver decides downstream). Here
 * we keep every non-ignored own-or-inherited property and let the message
 * writer + resolver handle the type — matching how the ORM emitters treat
 * scalar columns.
 *
 * `@@tableUnique` / `@@tableIndex` are model-level augments, not properties,
 * so they never appear here (Red Team A5 handled structurally).
 */
export function collectEntityProtoFields(program: Program, entity: Model): EntityProtoField[] {
  const out: EntityProtoField[] = [];
  for (const prop of walkPropertiesInherited(entity)) {
    // proto-side ignore: dropped from emit; caller reserves the number.
    if (isProtoIgnored(program, prop)) continue;
    // orm-only ignore: never a proto field, skip silently (no reservation).
    if (isOrmIgnored(program, prop)) continue;

    const protoName = getProtoFieldName(program, prop) ?? camelToProtoSnake(prop.name);
    out.push({
      prop,
      protoName,
      pinned: getProtoFieldNumber(program, prop),
    });
  }
  return out;
}

/**
 * Build allocator field requests from an entity's proto fields, in declaration
 * order. The allocator keys on the proto field NAME so renames (handled via
 * `--rename`) keep their numbers.
 */
export function toFieldRequests(fields: EntityProtoField[]): EntityFieldRequest[] {
  return fields.map((f) => ({ name: f.protoName, pinned: f.pinned }));
}

/**
 * Compute the proto-side ignored properties of an entity so the caller can
 * reserve their allocated numbers (Red Team S3 — `@ignore` auto-reserves).
 */
export function collectProtoIgnoredFieldNames(program: Program, entity: Model): string[] {
  const names: string[] = [];
  for (const prop of walkPropertiesInherited(entity)) {
    if (isProtoIgnored(program, prop) && !isOrmIgnored(program, prop)) {
      names.push(getProtoFieldName(program, prop) ?? camelToProtoSnake(prop.name));
    }
  }
  return names;
}
