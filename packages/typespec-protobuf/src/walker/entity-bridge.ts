import type { Model, Program } from "@typespec/compiler";
import { FieldNumberKey, ReservedKey } from "../lib.js";
import type { ProtoReservation } from "../decorators-message.js";
import type { PackageBucket } from "./collect-packages.js";
import {
  collectEntityProtoFields,
  toFieldRequests,
  type EntityProtoField,
} from "./entity-fields.js";
import { reconcileTable, type EntityFieldRequest } from "../allocator/reconcile.js";
import type { AllocationTable } from "../allocator/allocation-table.js";

export interface EntityBridgeResult {
  /** Full allocation table (stored entries merged with this pass's results). */
  table: AllocationTable;
  /** True when any entity in THIS pass drifted from the stored allocation. */
  drifted: boolean;
  /** Entity keys that drifted, for diagnostics. */
  driftedEntities: string[];
  /**
   * Entity keys where the allocator saw BOTH a dropped field AND a new field
   * in one pass — an ambiguous rename that `field-name-rename-strict` mode
   * rejects (Red Team S2). The author must use an explicit `--rename`.
   */
  renameAmbiguous: string[];
}

/**
 * Stable allocation key for an entity: `<protoPackage>.<ModelName>` (e.g.
 * `openlet.user.v1.UserProfile`). Unique across the program because proto
 * package names are unique and model names are unique within a package.
 */
export function entityKey(packageName: string, model: Model): string {
  return `${packageName}.${model.name}`;
}

/**
 * Reconcile every `@entity` in the WRITE buckets against the stored allocation
 * table, inject the resulting field numbers + reserved ranges into the program
 * state maps (so the existing message writer emits entities unchanged), and
 * return the merged table to persist.
 *
 * Allocation is GLOBAL per emit pass (Red Team A3): all entities are reconciled
 * together so sequential numbering is deterministic. Entities NOT in this pass
 * (e.g. other services when `emit-only` is set) are preserved from the stored
 * table untouched, so a single-service emit never drops another service's
 * allocations.
 */
export function prepareEntityAllocations(
  program: Program,
  buckets: PackageBucket[],
  stored: AllocationTable,
): EntityBridgeResult {
  const requests = new Map<string, EntityFieldRequest[]>();
  const meta = new Map<string, { model: Model; fields: EntityProtoField[] }>();

  for (const bucket of buckets) {
    for (const entity of bucket.entities) {
      const key = entityKey(bucket.spec.name, entity);
      const fields = collectEntityProtoFields(program, entity);
      requests.set(key, toFieldRequests(fields));
      meta.set(key, { model: entity, fields });
    }
  }

  const { table: reconciled, results, drifted } = reconcileTable(requests, stored);

  // Merge: preserve stored entries for entities NOT in this pass.
  const merged: AllocationTable = new Map(stored);
  for (const [key, alloc] of reconciled) merged.set(key, alloc);

  const driftedEntities: string[] = [];
  const renameAmbiguous: string[] = [];
  for (const [key, { model, fields }] of meta) {
    const result = results.get(key)!;
    if (result.changed) driftedEntities.push(key);
    // Ambiguous rename: a field disappeared AND a new one appeared in the same
    // pass. The allocator can't tell a rename from a delete+add (Red Team S2).
    if (result.added.length > 0 && result.dropped.length > 0) {
      renameAmbiguous.push(key);
    }

    // Inject field numbers so renderProtoMessage picks them up.
    for (const f of fields) {
      const num = result.assignments.get(f.protoName);
      if (num !== undefined) {
        program.stateMap(FieldNumberKey).set(f.prop, num);
      }
    }

    // Inject reserved numbers (from dropped fields) as message reservations.
    if (result.updated.reserved.size > 0) {
      const reservations: ProtoReservation[] = [...result.updated.reserved]
        .sort((a, b) => a - b)
        .map((value) => ({ kind: "index", value }));
      const existing =
        (program.stateMap(ReservedKey).get(model) as ProtoReservation[] | undefined) ?? [];
      program.stateMap(ReservedKey).set(model, [...existing, ...reservations]);
    }
  }

  return { table: merged, drifted, driftedEntities, renameAmbiguous };
}
