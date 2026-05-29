# Field-Number Allocator (`@entity`)

`@entity` models produce BOTH ORM rows (ent/sqlmodel) AND a proto message from a
single declaration. Unlike a plain `@message`, an `@entity` does not hand-pick
proto field numbers — the allocator assigns them and persists the mapping so they
stay STABLE across emits (wire compatibility depends on stable numbers).

> **Source:** `src/allocator/`, `src/walker/entity-bridge.ts`.

## The allocation file

Field assignments live in a checked-in JSON file (default
`.proto-field-allocations.json` at the emitter output root; openlet uses a single
root file at `packages/specs/.proto-field-allocations.json`).

```json
{
  "openlet.user.v1.UserProfile": {
    "user_id": 1,
    "display_name": 2,
    "avatar_url": 3,
    "_reserved": [5, 6]
  }
}
```

- Keys are `<protoPackage>.<ModelName>`.
- Field keys are the proto (snake_case) field names.
- `_reserved` holds numbers freed by deleted fields — never reused.
- Serialization is deterministic: entity keys sorted, fields by ascending number,
  `_reserved` sorted, omitted when empty. Keeps git diffs minimal.

## Lifecycle

| Event                   | Behavior                                                                                                                                             |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| New field               | Next free SEQUENTIAL number (skips `_reserved` + the proto 19000–19999 band). No hashing — birthday-collision risk is unacceptable for wire numbers. |
| Field retained          | Keeps its stored number.                                                                                                                             |
| Field deleted           | Number moves to `_reserved`; a `reserved N;` line is emitted in the proto.                                                                           |
| Field renamed           | Use `--rename old=new` (see below) to keep the number. Without it, a rename looks like delete + add.                                                 |
| `@field(N)` pin         | Author-supplied number wins; the allocator records it.                                                                                               |
| `@Openlet.Proto.ignore` | Field dropped from emit (not allocated).                                                                                                             |

Allocation is **global per emit pass**: all entities in the write set are
reconciled together so sequential numbering is deterministic. Entities NOT in the
current pass (e.g. other services under `emit-only`) are preserved untouched.

## Drift detection (CI gate)

Set `allocation-check: true` in `tspconfig` (CI does this). When the allocator
wants to write changes that aren't already committed, it fails with a
`proto-field-allocation-drift` error and writes nothing — forcing the author to
commit the updated allocation file.

Local dev leaves `allocation-check` off, so `make spec` writes the file and you
commit it alongside the spec change.

## Rename-strict mode (default ON)

`field-name-rename-strict` (default `true`) rejects an ambiguous rename — a
dropped field AND a new field appearing in the same entity in one pass — with a
`field-name-rename-ambiguous` error. The allocator can't tell a rename from a
delete + add, and guessing wrong silently breaks the wire. Resolve by either:

1. Passing `--rename old=new` to preserve the original number, or
2. Disabling rename-strict to accept the delete + add (the old number is reserved,
   the new field gets a fresh number).

## Merge conflicts

Two devs adding fields to the same entity produces a JSON conflict. Resolution
protocol: delete the conflict markers, re-run the allocator (it re-assigns in
canonical order — lexicographic field name within entity, sequential numbers from
the smallest free number), commit the result. Numerically-larger-wins is the
tiebreaker when both sides assigned the same number to different fields.

> The `make spec-allocate` deterministic resolver that automates this lives on
> the openlet side (Phase 7). The deterministic serializer that makes it possible
> is implemented here.

## Mixins

ORM mixins (`Timestamps`, `SoftDelete`, custom) auto-propagate into the proto
message — a client holding a row can serialize it whole. Opt a mixin column out
with `@Openlet.Proto.ignore`.
