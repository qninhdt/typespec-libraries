/**
 * Field-number allocator for `@entity` models.
 *
 * `@entity` models usually don't carry hand-picked proto field numbers, but
 * wire compatibility hinges on numbers being STABLE across emits. The
 * allocator persists `entity.field → number` assignments in a checked-in JSON
 * file (`packages/specs/.proto-field-allocations.json`) so numbers survive
 * renames, deletions, and reorderings.
 *
 * This module is PURE — no filesystem access — so it is fully unit-testable.
 * `allocator-io.ts` wraps it with file load/save for the emitter.
 *
 * Lifecycle (Phase 5 plan):
 * - New field → next free SEQUENTIAL number (never hashed — Red Team D3).
 * - Renamed field (via `pinRename`) → keeps the original number.
 * - Deleted field → number moves to `_reserved`, never reused (Red Team S3).
 * - Hand-authored `@field(N)` → pins that number, allocator records it.
 * - Drift between loaded + computed state is a HARD signal (Red Team A1/S1);
 *   the caller fails `make spec-check` on drift.
 */

/** Per-entity allocation: field name → number, plus reserved numbers. */
export interface EntityAllocation {
  fields: Map<string, number>;
  reserved: Set<number>;
}

/** The full allocation table: entity key → its allocation. */
export type AllocationTable = Map<string, EntityAllocation>;

/** Serializable JSON shape (what lands on disk). */
export interface AllocationJson {
  [entityKey: string]: {
    [fieldOrReserved: string]: number | number[];
  };
}

/** Lowest proto field number the allocator hands out. */
export const FIRST_FIELD_NUMBER = 1;

/** proto implementation-reserved range (skipped during allocation). */
export const RESERVED_RANGE_START = 19000;
export const RESERVED_RANGE_END = 19999;

/**
 * Parse the on-disk JSON into an {@link AllocationTable}. Tolerates a missing
 * `_reserved` key. Throws on structurally invalid input so a corrupt file
 * fails loudly rather than silently dropping allocations.
 */
export function parseAllocationTable(json: AllocationJson): AllocationTable {
  const table: AllocationTable = new Map();
  for (const [entityKey, entry] of Object.entries(json)) {
    const fields = new Map<string, number>();
    const reserved = new Set<number>();
    for (const [key, value] of Object.entries(entry)) {
      if (key === "_reserved") {
        if (!Array.isArray(value)) {
          throw new Error(`_reserved for "${entityKey}" must be an array of numbers`);
        }
        for (const n of value) reserved.add(n);
      } else {
        if (typeof value !== "number") {
          throw new Error(`field "${key}" of "${entityKey}" must map to a number`);
        }
        fields.set(key, value);
      }
    }
    table.set(entityKey, { fields, reserved });
  }
  return table;
}

/**
 * Serialize an {@link AllocationTable} back to the deterministic JSON shape:
 * entity keys sorted lexicographically, fields in allocation order (ascending
 * number), `_reserved` sorted ascending and only emitted when non-empty.
 */
export function serializeAllocationTable(table: AllocationTable): AllocationJson {
  const out: AllocationJson = {};
  const entityKeys = [...table.keys()].sort();
  for (const entityKey of entityKeys) {
    const alloc = table.get(entityKey)!;
    const entry: { [k: string]: number | number[] } = {};
    const fieldsByNumber = [...alloc.fields.entries()].sort((a, b) => a[1] - b[1]);
    for (const [name, num] of fieldsByNumber) {
      entry[name] = num;
    }
    if (alloc.reserved.size > 0) {
      entry["_reserved"] = [...alloc.reserved].sort((a, b) => a - b);
    }
    out[entityKey] = entry;
  }
  return out;
}
