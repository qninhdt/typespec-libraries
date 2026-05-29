import type { AllocationTable, EntityAllocation } from "./allocation-table.js";
import {
  FIRST_FIELD_NUMBER,
  RESERVED_RANGE_START,
  RESERVED_RANGE_END,
} from "./allocation-table.js";

/** A field the allocator must assign a number to, in declaration order. */
export interface EntityFieldRequest {
  /** Field name (proto snake_case form — the allocator key). */
  name: string;
  /** Explicit `@field(N)` pin, when the author supplied one. */
  pinned?: number;
}

/** Outcome of reconciling one entity against the stored allocation. */
export interface EntityReconcileResult {
  /** Final field name → number map (the numbers the emitter will write). */
  assignments: Map<string, number>;
  /** Updated allocation to persist back (includes new + reserved numbers). */
  updated: EntityAllocation;
  /** True when `updated` differs from the input allocation (drift signal). */
  changed: boolean;
  /** Field names that were newly allocated this pass. */
  added: string[];
  /** Field names that disappeared and whose numbers moved to `_reserved`. */
  dropped: string[];
}

/**
 * Reconcile one entity's current fields against its stored allocation.
 *
 * Rules:
 * - A field present in BOTH keeps its stored number.
 * - A field present in the spec but NOT stored gets the next free sequential
 *   number (skipping the proto reserved range + any `_reserved` numbers).
 * - A field stored but NOT in the spec is treated as DELETED: its number moves
 *   to `_reserved` so it can never be silently reused (Red Team S3).
 * - An explicit `@field(N)` pin always wins; the allocator records it and will
 *   not hand N out to another field.
 *
 * The function is pure: it returns the updated allocation rather than mutating
 * the input.
 */
export function reconcileEntity(
  current: EntityFieldRequest[],
  stored: EntityAllocation | undefined,
): EntityReconcileResult {
  const storedFields = stored?.fields ?? new Map<string, number>();
  const storedReserved = stored?.reserved ?? new Set<number>();

  const assignments = new Map<string, number>();
  const used = new Set<number>();
  const currentNames = new Set(current.map((f) => f.name));

  // Pass 1: honor explicit pins + retained stored numbers.
  for (const field of current) {
    if (field.pinned !== undefined) {
      assignments.set(field.name, field.pinned);
      used.add(field.pinned);
    } else {
      const existing = storedFields.get(field.name);
      if (existing !== undefined) {
        assignments.set(field.name, existing);
        used.add(existing);
      }
    }
  }

  // Reserved numbers stay off-limits during fresh allocation.
  for (const r of storedReserved) used.add(r);

  // Pass 2: allocate fresh numbers for unassigned fields, in declaration order.
  let next = FIRST_FIELD_NUMBER;
  const added: string[] = [];
  for (const field of current) {
    if (assignments.has(field.name)) continue;
    next = nextFreeNumber(next, used);
    assignments.set(field.name, next);
    used.add(next);
    added.push(field.name);
  }

  // Determine dropped fields → move their numbers to reserved.
  const reserved = new Set<number>(storedReserved);
  const dropped: string[] = [];
  for (const [name, num] of storedFields) {
    if (!currentNames.has(name)) {
      reserved.add(num);
      dropped.push(name);
    }
  }

  // Build updated allocation (fields = current assignments that are NOT pins
  // beyond what we track; we persist every assigned field number).
  const updatedFields = new Map<string, number>();
  for (const field of current) {
    const num = assignments.get(field.name);
    if (num !== undefined) updatedFields.set(field.name, num);
  }
  const updated: EntityAllocation = { fields: updatedFields, reserved };

  const changed = !allocationsEqual(stored, updated);
  return { assignments, updated, changed, added, dropped };
}

/**
 * Apply an explicit rename (`--rename old=new`) to a stored allocation BEFORE
 * reconciliation, so the renamed field keeps its original number instead of
 * being treated as a drop + add. Returns a new allocation; the input is not
 * mutated.
 */
export function applyRename(
  stored: EntityAllocation,
  oldName: string,
  newName: string,
): EntityAllocation {
  const fields = new Map(stored.fields);
  const num = fields.get(oldName);
  if (num === undefined) return stored;
  fields.delete(oldName);
  fields.set(newName, num);
  return { fields, reserved: new Set(stored.reserved) };
}

function nextFreeNumber(start: number, used: Set<number>): number {
  let n = start;
  while (used.has(n) || (n >= RESERVED_RANGE_START && n <= RESERVED_RANGE_END)) {
    n++;
  }
  return n;
}

function allocationsEqual(a: EntityAllocation | undefined, b: EntityAllocation): boolean {
  if (!a) return b.fields.size === 0 && b.reserved.size === 0;
  if (a.fields.size !== b.fields.size) return false;
  if (a.reserved.size !== b.reserved.size) return false;
  for (const [k, v] of a.fields) {
    if (b.fields.get(k) !== v) return false;
  }
  for (const r of a.reserved) {
    if (!b.reserved.has(r)) return false;
  }
  return true;
}

/**
 * Reconcile an entire program's worth of entities and report whether ANY
 * entity drifted (Red Team A1/S1: drift = hard error at `make spec-check`).
 */
export function reconcileTable(
  requests: Map<string, EntityFieldRequest[]>,
  stored: AllocationTable,
): { table: AllocationTable; results: Map<string, EntityReconcileResult>; drifted: boolean } {
  const table: AllocationTable = new Map();
  const results = new Map<string, EntityReconcileResult>();
  let drifted = false;
  for (const [entityKey, fields] of requests) {
    const result = reconcileEntity(fields, stored.get(entityKey));
    table.set(entityKey, result.updated);
    results.set(entityKey, result);
    if (result.changed) drifted = true;
  }
  return { table, results, drifted };
}
