# Phase 2 — New Primitives openlet Needs

**Goal:** add the decorators and emitter behaviors required to express openlet's actual database patterns that don't exist in the library today. After Phase 2, hand-written `apps/*/migrations/*.sql` and `packages/proto/**/*.proto` should be reproducible from TypeSpec sources.

**Duration:** 3–4 weeks (one engineer; can overlap with late Phase 1).

**Prerequisite:** Phase 1 merged. Specifically: `@check`, `@indexUsing`, `@version`, `@polymorphic` wired; CI integration tests in place; `@manyToManyOwner` decorator available.

**Out of scope (deferred to Phase 4):** RLS scaffolding from `@tenantId`, Alembic env.py, partitioning, generated columns, materialized views, triggers, custom PG types/domains, pgvector / pg_trgm extensions.

**Stack constraint (locked by user):** Ent stays. openlet keeps Atlas migrations. No typed-pgx alternative emitter.

---

## Why these primitives, in this order

Every item below is grounded in a concrete openlet pattern from the audit. Ranked by occurrence count and blast radius:

| Primitive                                                      | openlet usage count                                | Workstream |
| -------------------------------------------------------------- | -------------------------------------------------- | ---------- |
| Partial unique / partial non-unique indexes                    | 8+ migrations                                      | W1         |
| Soft-delete query helpers (default `WHERE deleted_at IS NULL`) | every query in file-service                        | W2         |
| Composite-key FKs                                              | `workspace_members` (3-col PK) referenced by audit | W3         |
| Outbox + retry-ledger pattern                                  | `outbox`, `deleted_artifacts`                      | W4         |
| TSVECTOR + GIN + setweight()                                   | file-service search                                | W5         |
| Protobuf reserved-field tombstoning                            | every `*.proto`                                    | W6         |

The first four hit hardest: without them, every openlet service still hand-writes migrations or boilerplate-laden Ent schemas. W5 unlocks search end-to-end. W6 closes the protobuf side of the source-of-truth story.

---

## Workstreams

### W1. Partial indexes

**openlet patterns to express.**

```sql
-- file-service/migrations/000001_init.up.sql:50-56
CREATE UNIQUE INDEX folders_unique_name_per_parent
  ON folders (workspace_id, parent_folder_id, name)
  WHERE deleted_at IS NULL AND parent_folder_id IS NOT NULL;

-- auth-service/migrations/000001_init.up.sql:55
CREATE UNIQUE INDEX signing_keys_one_active
  ON signing_keys (status) WHERE status = 'active';

-- file-service/migrations/000004_outbox.up.sql:20-22
CREATE INDEX idx_outbox_unpublished
  ON outbox (created_at) WHERE published_at IS NULL;

-- file-service/migrations/000002_search_tagging.up.sql:8-10
CREATE INDEX files_search_idx
  ON files USING GIN (search_vector)
  WHERE deleted_at IS NULL AND status = 'ready';
```

**Decorator surface (extend, don't introduce new names).**

```typespec
// field-level
@index({ where: "deleted_at IS NULL", using: "gin" })
search_vector: tsvector;

// model-level
@@tableIndex(["workspace_id", "parent_folder_id", "name"], {
  name: "folders_unique_name_per_parent",
  unique: true,
  where: "deleted_at IS NULL AND parent_folder_id IS NOT NULL",
})
```

`@index` and `@@tableIndex` already accept positional args; we extend them to accept an options bag. Backwards compatible: existing call sites with no options bag continue to work.

**Ent emission target.**

```go
func (Folder) Indexes() []ent.Index {
  return []ent.Index{
    index.Fields("workspace_id", "parent_folder_id", "name").
      Unique().
      Annotations(entsql.IndexWhere("deleted_at IS NULL AND parent_folder_id IS NOT NULL")),
  }
}
```

`entsql.IndexWhere(predicate)` is the Ent-supported method for partial-index predicates. Verify against current Ent version; if missing, fall back to raw `entsql.Annotation{Where: "..."}`.

**SQLModel emission target.**

```python
__table_args__ = (
    Index(
        "folders_unique_name_per_parent",
        "workspace_id", "parent_folder_id", "name",
        unique=True,
        postgresql_where=text("deleted_at IS NULL AND parent_folder_id IS NOT NULL"),
    ),
)
```

**DBML emission target.** DBML supports index notes; emit predicate as a note comment since DBML has no native partial-index syntax:

```dbml
indexes {
  (workspace_id, parent_folder_id, name) [unique, name: 'folders_unique_name_per_parent', note: 'partial: deleted_at IS NULL AND parent_folder_id IS NOT NULL']
}
```

**Files to touch.**

- `packages/typespec-orm/lib/main.tsp` — extend signatures with options bag.
- `packages/typespec-orm/src/decorators-column.ts`, `decorators-table.ts` — accept options bag, store on `IndexKey` / `ModelIndexesKey`.
- `packages/typespec-orm/src/state-types.ts` — add `where?: string`, `using?: string`, `unique?: boolean` to normalized index entries.
- `packages/typespec-orm/src/diagnostics.ts` — `partial-index-predicate-empty`.
- `packages/typespec-ent/src/components/ent-index.ts` — emit `IndexWhere(...)`.
- `packages/typespec-sqlmodel/src/components/py-model-table-args.ts` — emit `postgresql_where=text(...)`.
- `packages/typespec-dbml/src/components/DbmlTable.tsx` — emit `note:` settings.

**Testing.**

- Unit: every emitter, with and without `where`, with and without `using`, with and without `unique`.
- Snapshot: openlet's eight partial-index sites regenerate with byte-equivalent SQL after `atlas migrate diff`.
- Integration: `go build` and Python import succeed.

**Risk.** SQL predicates are opaque strings; library does not parse them. Document that the predicate is taken verbatim and the user is responsible for matching their database dialect. Add a smoke validator for obviously-wrong inputs (empty, contains `;`).

---

### W2. Soft-delete query helpers

**Why.** openlet's `@softDelete` already marks columns. Every repository function in `apps/file-service/internal/repo/` then hand-writes `WHERE deleted_at IS NULL`. The library should emit query-layer interceptors so this becomes the default.

**Decorator semantics.** No new decorator. Extend behavior of existing `@softDelete`:

- Marks column as nullable timestamptz with index (already done).
- Adds query-layer filter at runtime so reads default to non-deleted rows.
- Provides an explicit "include deleted" escape hatch.

**Ent emission target.** Ent supports schema-level interceptors:

```go
// emitted ent/schema/file.go
func (File) Interceptors() []ent.Interceptor {
  return []ent.Interceptor{
    entsoftdelete.HideDeleted(),
  }
}
```

Where `entsoftdelete` is a small runtime package shipped by `typespec-ent` (similar to the audit helper introduced in Phase 1):

```go
// packages/typespec-ent/runtime/softdelete/softdelete.go
package entsoftdelete

import (
  "context"
  "entgo.io/ent"
  "entgo.io/ent/dialect/sql"
)

type ctxKey struct{}

// IncludeDeleted returns a context that disables the soft-delete filter.
func IncludeDeleted(ctx context.Context) context.Context {
  return context.WithValue(ctx, ctxKey{}, true)
}

func skipFilter(ctx context.Context) bool {
  v, _ := ctx.Value(ctxKey{}).(bool)
  return v
}

// HideDeleted returns an Interceptor that adds WHERE deleted_at IS NULL.
func HideDeleted() ent.Interceptor {
  return ent.TraverseFunc(func(ctx context.Context, q ent.Query) error {
    if skipFilter(ctx) {
      return nil
    }
    type whereStep interface {
      Where(...func(*sql.Selector))
    }
    if w, ok := q.(whereStep); ok {
      w.Where(func(s *sql.Selector) { s.Where(sql.IsNull(s.C("deleted_at"))) })
    }
    return nil
  })
}
```

Verified against Ent's `ent.Interceptor` API (Ent ≥0.13). For older Ent versions fallback to a `Hooks()` block; document the minimum version.

**SQLModel emission target.** Use SQLAlchemy `with_loader_criteria` registered in the package `__init__.py`:

```python
# emitted file_vault/file/__init__.py
from sqlalchemy import event
from sqlalchemy.orm import with_loader_criteria, Session
from .file import File

@event.listens_for(Session, "do_orm_execute")
def _filter_soft_deleted(execute_state):
    if execute_state.execution_options.get("include_deleted"):
        return
    execute_state.statement = execute_state.statement.options(
        with_loader_criteria(File, File.deleted_at.is_(None), include_aliases=True)
    )
```

Escape hatch: `session.execute(stmt, execution_options={"include_deleted": True})`.

**Files to touch.**

- `packages/typespec-ent/runtime/softdelete/` (new) — Go runtime helper.
- `packages/typespec-ent/src/emitter.tsx` — copy runtime when standalone + any model has soft-delete.
- `packages/typespec-ent/src/components/EntSchema.tsx` — emit `Interceptors()` block.
- `packages/typespec-sqlmodel/src/components/py-init.ts` — emit `do_orm_execute` listener block per package.
- `packages/typespec-orm/src/state-types.ts` — already exposes `softDeleteColumn`; reuse.
- `packages/typespec-ent/lib/options.ts` — new option `soft-delete-mode: "interceptor" | "hook" | "none"` (default `"interceptor"`).
- Docs: `docs/soft-delete.md` explaining escape hatches and trade-offs.

**Testing.**

- Unit Ent: assert interceptor block emitted; runtime package present in output.
- Unit SQLModel: assert `do_orm_execute` listener emitted in `__init__.py`.
- Integration: tiny Go test that creates a soft-deleted row and asserts default queries skip it; equivalent Python test.

**Risk.** Interceptor model assumes every soft-deletable model has an actual `deleted_at` column with that exact name. Enforce via diagnostic: `@softDelete` must be on a property mapped to column `deleted_at` (or honor `@map(...)` and read the actual column name into the emitted code).

---

### W3. Composite-key foreign keys

**openlet pattern.** `workspace_members` has composite PK `(workspace_id, principal_type, principal_id)`. `audit_log` rows reference a member by all three. Today this is impossible to express; openlet writes the FK as raw SQL.

**Decorator surface.** Extend `@foreignKey`:

```typespec
// existing single-field form (unchanged)
@foreignKey("organizationCode", "code")
organization: Organization;

// new composite form
@foreignKey(
  ["workspaceId", "principalType", "principalId"],
  ["workspace_id", "principal_type", "principal_id"],
)
member: WorkspaceMember;
```

Both args become `string | string[]`. Length must match.

**Ent emission target.** Ent edges only support single-column FKs. We have two options:

1. **Skip the Ent edge, emit raw SQL FK via Atlas annotation.** Add `entsql.Annotation{ ... }` at schema level emitting a composite FOREIGN KEY constraint. The relation does not appear as a navigable Ent edge.
2. **Emit a synthetic single-column FK to a surrogate id** if the target has one. Reject composite FK declarations to a model without surrogate id.

We choose (1): generate raw SQL constraint. The application layer joins manually. This matches openlet's actual repo code style (hand-written SQL).

```go
func (AuditLog) Annotations() []schema.Annotation {
  return []schema.Annotation{
    entsql.Annotation{
      Constraints: []entsql.Constraint{{
        Name: "audit_log_member_fkey",
        Columns: []string{"workspace_id", "principal_type", "principal_id"},
        Reference: entsql.Reference{
          Table: "workspace_members",
          Columns: []string{"workspace_id", "principal_type", "principal_id"},
        },
        OnDelete: "CASCADE",
      }},
    },
  }
}
```

API verified against `ariga.io/atlas` doc; if the exact `entsql.Constraint` shape differs in current Ent version, fall back to a raw migration hint comment + actual constraint emitted via `atlas migrate diff` from the same TypeSpec source through DBML. Keep DBML as the truth for composite FKs.

**SQLModel emission target.** Use SQLAlchemy `ForeignKeyConstraint` in `__table_args__`:

```python
__table_args__ = (
    ForeignKeyConstraint(
        ["workspace_id", "principal_type", "principal_id"],
        ["workspace_members.workspace_id", "workspace_members.principal_type", "workspace_members.principal_id"],
        name="audit_log_member_fkey",
        ondelete="CASCADE",
    ),
)
```

**DBML emission target.** Composite Ref:

```dbml
Ref: audit_log.(workspace_id, principal_type, principal_id) > workspace_members.(workspace_id, principal_type, principal_id) [delete: cascade]
```

**Files to touch.**

- `packages/typespec-orm/lib/main.tsp` — `@foreignKey` signature: `localFields: string | string[], targetFields?: string | string[]`.
- `packages/typespec-orm/src/decorators-relations.ts` — accept and validate.
- `packages/typespec-orm/src/diagnostics.ts` — `composite-fk-length-mismatch`, `composite-fk-target-not-found`.
- `packages/typespec-orm/src/relations-resolution.ts` — track composite FK in normalized relation.
- `packages/typespec-ent/src/components/EntSchema.tsx` — emit `entsql.Annotation` constraints; do not emit edge.
- `packages/typespec-sqlmodel/src/components/py-model-table-args.ts` — emit `ForeignKeyConstraint`.
- `packages/typespec-dbml/src/components/DbmlAssociation.tsx` — emit composite Ref syntax.

**Testing.** Unit per emitter; snapshot for openlet `audit_log → workspace_members` shape; round-trip DBML→SQL via `dbml2sql` to verify composite Ref renders.

**Risk.** Ent's composite-FK story is weakest here. If `entsql.Constraint` doesn't behave, we fall back to emitting only the SQL constraint via Atlas + a doc-comment in Ent. Application code in openlet already does manual joins, so the missing edge is acceptable.

---

### W4. Outbox + retry-ledger macro

**openlet patterns to express.** Two near-identical tables in `apps/file-service/migrations/`:

```sql
-- 000004_outbox.up.sql
CREATE TABLE outbox (
  id BIGSERIAL PRIMARY KEY,
  topic TEXT NOT NULL,
  key TEXT NOT NULL,
  payload BYTEA NOT NULL,
  headers JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ,
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT
);
CREATE INDEX idx_outbox_unpublished ON outbox (created_at) WHERE published_at IS NULL;

-- 000006_deleted_artifacts.up.sql
CREATE TABLE deleted_artifacts (
  id BIGSERIAL PRIMARY KEY,
  file_id UUID NOT NULL,
  storage_key TEXT NOT NULL,
  search_doc_id TEXT,
  s3_purged_at TIMESTAMPTZ,
  search_purged_at TIMESTAMPTZ,
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX deleted_artifacts_pending_idx
  ON deleted_artifacts (created_at)
  WHERE s3_purged_at IS NULL OR search_purged_at IS NULL;
```

**Decorator surface (new model decorator, not a macro).**

```typespec
@table
@@outbox
model Outbox {
  // user declares only the domain-specific fields
  topic: string;
  key: string;

  @scope("event-payload")
  payload: bytes;

  headers: jsonb = #{};
}
```

`@@outbox` injects:

- `id: bigSerial` (PK, surrogate)
- `created_at: utcDateTime` with `@autoCreateTime`, default now()
- `published_at: utcDateTime?`
- `attempts: int32` default 0
- `last_error: string?`
- `@@tableIndex(["created_at"], { name: "idx_<table>_unpublished", where: "published_at IS NULL" })`

Generic retry-ledger via `@@retryLedger(["s3_purged_at", "search_purged_at"])` for the `deleted_artifacts` shape — injects `attempts`, `last_error`, `created_at`, plus partial index on rows where any of the listed timestamps is NULL.

**Rationale for two decorators rather than one:** outbox is a Kafka-shaped pattern (topic + key + payload). Retry-ledger is a generalized "still has work to do" table. Different shape, different injected columns.

**Files to touch.**

- `packages/typespec-orm/lib/main.tsp` — declare `@@outbox` and `@@retryLedger(predicateColumns: string[])`.
- `packages/typespec-orm/src/decorators-table.ts` — store on state.
- `packages/typespec-orm/src/normalization.ts` — during normalization, synthesize injected fields and indexes onto the model **before** validators run, so all downstream emitters see the expanded model uniformly.
- `packages/typespec-orm/src/diagnostics.ts` — `outbox-required-field-missing`, `retry-ledger-predicate-empty`.
- No emitter-side changes needed — once normalization expands the model, existing index/field emission handles the rest.

**Testing.**

- Unit ORM: `@@outbox` injects expected fields and index; collision with user-declared `id` raises `outbox-field-conflict`.
- Snapshot Ent + SQLModel + DBML: openlet's `outbox` and `deleted_artifacts` regenerate identically to current hand-written SQL.

**Risk.** Field injection at normalization time is invasive. Test for collisions: user redeclaring `id` or `attempts` should error, not silently override. Document the injected schema explicitly.

---

### W5. TSVECTOR + `@searchVector`

**openlet pattern.**

```sql
-- file-service/migrations/000002_search_tagging.up.sql
ALTER TABLE files ADD COLUMN search_vector TSVECTOR;
CREATE INDEX files_search_idx
  ON files USING GIN (search_vector)
  WHERE deleted_at IS NULL AND status = 'ready';
```

```go
// apps/file-service/internal/repo/files_search.go:15-21
to_tsvector('english',
  setweight(to_tsvector('english', name), 'A') ||
  setweight(to_tsvector('english', coalesce(extracted_text, '')), 'B')
)
```

The vector is updated by application code (not a trigger). Library should:

1. Recognize `tsvector` scalar (already in scalar map).
2. Provide `@searchVector(weights, language?)` to declare the source-fields-and-weights mapping next to the schema.
3. Emit either a Postgres GENERATED column OR a helper SQL expression that openlet's repo layer can call.

**Decorator surface.**

```typespec
@table
model File {
  @maxLength(255) name: string;

  @scope("not-frontend")
  extracted_text?: string;

  @indexUsing("gin")
  @index({ where: "deleted_at IS NULL AND status = 'ready'" })
  @searchVector({
    language: "english",
    weights: { name: "A", extracted_text: "B" },
    mode: "stored", // or "expression"
  })
  search_vector: tsvector;
}
```

**`mode: "stored"` emission target (PG generated column).** When mode is `stored`, emit a Postgres GENERATED ALWAYS AS column. Postgres requires the expression be `IMMUTABLE` — `to_tsvector('english', col)` is immutable, so it works:

```sql
-- emitted via @defaultExpression-equivalent, but as GENERATED
ALTER TABLE files ADD COLUMN search_vector TSVECTOR
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(extracted_text, '')), 'B')
  ) STORED;
```

Ent does not natively support generated columns; we use `entsql.Annotation{Default: "..."}` plus a custom Atlas annotation, OR mark the column with a comment annotation `// generated by typespec-libraries: stored search_vector` so openlet's Atlas pipeline can hand-wire the GENERATED clause.

**`mode: "expression"` emission target (helper export).** When mode is `expression`, the column is plain `tsvector` and the library exports the expression as a constant for application code to use:

```go
// emitted in ent/runtime/searchvectors.go (standalone mode)
package searchvectors

const FileSearchVectorExpr = `
  setweight(to_tsvector('english', coalesce($1, '')), 'A') ||
  setweight(to_tsvector('english', coalesce($2, '')), 'B')
`
```

```python
# emitted in <pkg>/file/_search.py
FILE_SEARCH_VECTOR_EXPR = (
    "setweight(to_tsvector('english', coalesce(:name, '')), 'A') || "
    "setweight(to_tsvector('english', coalesce(:extracted_text, '')), 'B')"
)
```

This matches openlet's current code style — repo layer composes the expression manually.

**Files to touch.**

- `packages/typespec-orm/lib/main.tsp` — declare `@searchVector(options)`.
- `packages/typespec-orm/src/decorators-column.ts` — store options.
- `packages/typespec-orm/src/diagnostics.ts` — `search-vector-target-not-found`, `search-vector-invalid-weight`.
- `packages/typespec-ent/src/components/EntSchema.tsx` — emit GENERATED annotation comment when `mode: "stored"`.
- `packages/typespec-ent/src/components/SearchVectorRuntime.tsx` (new) — emit constant when `mode: "expression"`.
- `packages/typespec-sqlmodel/src/components/PySearchVector.tsx` (new) — emit Python constant.
- DBML emits a comment note describing the search vector source fields.

**Testing.**

- Unit: invalid weight (`"X"`) raises diagnostic.
- Unit: source field not present on model raises diagnostic.
- Snapshot: openlet's `files.search_vector` emits the expected expression constant.

**Risk.** GENERATED columns aren't universally supported by Ent's migration planner. Default to `mode: "expression"` for openlet (matches current pattern); document `mode: "stored"` as experimental.

---

### W6. Protobuf reserved-field tombstoning

**openlet pattern.** Every `.proto` in `packages/proto/` carries:

```proto
message FileUploaded {
  string file_id = 1;
  // ...
  reserved 100 to 199;
}

message User {
  reserved 1;
  reserved "user_id";
  string email = 2;
  // ...
  reserved 100 to 199;
}

service UserService {}  // empty after method removal
```

Conventions:

- `reserved 100 to 199` per message: room for non-MVP fields.
- `reserved <num>; reserved "<name>";` for tombstoning removed fields, preserving `buf breaking` history.
- Empty service block kept after method removal.

Upstream `@typespec/protobuf` does not model these. We need a thin wrapper or a sibling emitter.

**Decorator surface.**

```typespec
import "@qninhdt/typespec-protobuf-extras";
using Qninhdt.ProtobufExtras;

@reservedRange(100, 199)
@reservedField(1, "user_id")
@Protobuf.message
model User {
  @field(2) email: string;
}

@reservedMethod("DeleteUser") // tombstoned method name
@Protobuf.service
interface UserService {}
```

**Two implementation options.**

**Option A (preferred): post-process upstream output.**

- Run upstream `@typespec/protobuf` first.
- A new package `@qninhdt/typespec-protobuf-extras` reads the generated `*.proto`, parses with a minimal proto parser, injects `reserved` blocks based on TypeSpec state, writes back.
- Pro: zero coupling to upstream emitter internals; survives upstream version bumps.
- Con: parses+rewrites text. Use `protobuf-eslint`-style parser (lightweight) or a maintained library like `protobufjs` for AST.

**Option B: replace emitter.** Fork upstream emitter. Rejected — high maintenance burden, defeats the "use upstream" decision in the README.

**Files (Option A).**

- `packages/typespec-protobuf-extras/` (new package).
  - `lib/main.tsp` — declare `@reservedRange`, `@reservedField`, `@reservedMethod`.
  - `src/decorators.ts` — store on state.
  - `src/post-process.ts` — parse `.proto` files in `output-dir`, inject reserved blocks.
  - `src/emitter.ts` — TypeSpec `$onEmit` that runs after `@typespec/protobuf`.
- `examples/file-vault/services/*/main.tsp` — opt in.
- `examples/file-vault/services/*/tspconfig.yaml` — list both emitters; ordering matters (extras after protobuf).

**Testing.**

- Unit: parse representative `.proto` files and verify `reserved` blocks injected correctly without disturbing field declarations.
- Snapshot: regenerate openlet's proto layer; diff against hand-written `.proto` should be empty.
- Integration: `buf lint` and `buf breaking` pass on emitted output.

**Risk.** Post-processing emitter output is fragile if upstream changes formatting. Pin upstream `@typespec/protobuf` minor version; document the supported range. Consider proposing the feature upstream instead — file an issue with the use case (openlet) and link.

---

## Migration & rollout

**Versioning.** Phase 2 is `0.x` minor bumps. All additions are backwards-compatible:

- Index decorators gain optional options bag; positional-only call sites continue to work.
- `@foreignKey` accepts `string | string[]`; existing `string` call sites unchanged.
- `@@outbox`, `@@retryLedger`, `@searchVector` are new decorators; opt-in only.
- Soft-delete interceptor emission is gated on `soft-delete-mode` option (default `"interceptor"` is the new behavior; `"none"` preserves prior).

Concern: existing `@softDelete` users on Phase 1 will see new runtime behavior on upgrade. Mitigate by gating behind explicit opt-in for the first release: default `"none"`, switch to `"interceptor"` in next minor with a CHANGELOG note. openlet opts in immediately.

**Order of merges.**

1. W1 partial indexes (foundation for W2, W4, W5)
2. W3 composite-key FKs (independent)
3. W2 soft-delete interceptors (depends on W1 for partial-unique-with-deleted-at-null patterns)
4. W4 outbox/retry-ledger (depends on W1)
5. W5 search vector (depends on W1 for partial GIN index)
6. W6 protobuf reserved (independent; can run parallel with any)

**openlet adoption checklist (after Phase 2 ships).**

- Convert all 8+ partial-index migrations to `@index({ where, using })` / `@@tableIndex(..., { where })`.
- Replace `WHERE deleted_at IS NULL` boilerplate in repo layer; switch to default-filtered queries with explicit `IncludeDeleted(ctx)` where needed.
- Convert `audit_log → workspace_members` FK to composite `@foreignKey([...], [...])`.
- Replace hand-written `outbox` and `deleted_artifacts` migrations with `@@outbox` / `@@retryLedger`.
- Convert `files.search_vector` to `@searchVector` decorator with `mode: "expression"`.
- Add `@reservedRange(100, 199)` to every Protobuf message; add `@reservedField` for any tombstoned fields.
- Re-run `atlas migrate diff`; expect minimal diff.

**Acceptance gate to leave Phase 2.** All of:

- ✅ All six workstream PRs merged
- ✅ CI integration tests green for all `examples/` projects
- ✅ openlet auth-service and file-service migrated to Phase 2 features; diff against current hand-written migrations is empty modulo cosmetic differences
- ✅ openlet `outbox` table is generated, not hand-written
- ✅ openlet `*.proto` files are generated end-to-end (typespec → protobuf → extras), `buf lint` clean

---

## Risks & mitigations

| Risk                                                                          | Likelihood | Impact | Mitigation                                                                                                                       |
| ----------------------------------------------------------------------------- | ---------- | ------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Ent `entsql.Constraint` API doesn't support composite FKs cleanly             | medium     | high   | fallback path documented (raw SQL via Atlas annotation comment); openlet's repo layer doesn't depend on Ent edge for this anyway |
| Soft-delete interceptor surprises users on upgrade                            | medium     | medium | gated behind option, default off in first release, openlet opts in explicitly                                                    |
| Outbox normalization-time field injection collides with user fields           | low        | high   | hard error on collision; comprehensive test coverage                                                                             |
| Postgres GENERATED column not honored by Ent migrations                       | high       | low    | default to `mode: "expression"`; openlet stays on expression mode                                                                |
| Protobuf post-processor breaks on upstream emitter formatting changes         | medium     | medium | pin upstream version; integration test catches breakage; consider upstream contribution                                          |
| Composite-FK target field validation hits performance issues on large schemas | low        | low    | scoped to declarations only, not transitive                                                                                      |

---

## Open questions for user

1. **Outbox decorator name.** `@@outbox` or `@outbox` (with model-target)? Plan currently assumes `@@`. Confirm.
2. **Search vector default mode.** `mode: "expression"` matches openlet today. Should `"stored"` ever be the default once it's stable? Recommend keeping `"expression"` default for openlet's lifetime.
3. **Protobuf extras package location.** Ship as a new top-level `packages/typespec-protobuf-extras/`, or fold into `typespec-orm` as a sub-emitter? New package is cleaner; extra release surface.
4. **Composite FK on Ent.** Accept the "no Ent edge, only SQL constraint" trade-off, or invest in a more elaborate solution (e.g., synthesize a surrogate key)? Recommend accept.
5. **Soft-delete column name.** Lock to `deleted_at`, or honor `@map(...)` for users who name it differently? Recommend honor `@map`.

Resolve before W4 / W5 / W6 start.
