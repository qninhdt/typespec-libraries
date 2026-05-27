# Phase 1 — Wire Declared Decorators

**Goal:** make the decorators the library already advertises actually flow through to Ent and SQLModel output. No new decorator names, no new emitter packages. Close the gap between `lib/main.tsp` doc strings and what `outputs/` actually contains.

**Duration:** 3–4 weeks (one engineer).

**Out of scope (deferred to Phase 2):** new decorators (`@partialIndex`, `@@outbox`, `@searchVector`), composite-key FKs, soft-delete query helpers, Alembic templates, RLS scaffolding from `@tenantId`.

**Stack constraint (locked by user):** Ent stays. We do **not** introduce a typed-pgx alternative, even though openlet currently never runs `ent generate`. openlet will start running `ent generate` as part of adopting this library.

---

## Why this phase first

Six decorators are declared in `packages/typespec-orm/lib/main.tsp` and stored in compiler state, but emitter code never reads them. They are silently no-ops today:

| Decorator                            | State key        | Ent       | SQLModel                 | Evidence                                                                                           |
| ------------------------------------ | ---------------- | --------- | ------------------------ | -------------------------------------------------------------------------------------------------- |
| `@check(name, expr)`                 | `CheckKey`       | not wired | not wired                | grep `getCheck` in `packages/typespec-ent/src` and `packages/typespec-sqlmodel/src` returns 0 hits |
| `@indexUsing(method)`                | `IndexUsingKey`  | not wired | wired                    | `packages/typespec-ent/src/components/ent-index*.ts` does not import `getIndexUsing`               |
| `@version`                           | `VersionKey`     | not wired | not wired                | `findVersionProperty` exported but never called by any emitter                                     |
| `@audit(role)`                       | `AuditKey`       | not wired | partial (info dict only) | no Ent hook scaffolding generated                                                                  |
| `@polymorphic(allowed[], idColumn?)` | `PolymorphicKey` | not wired | not wired                | `relations-resolution.ts` has zero refs to `PolymorphicKey`                                        |
| `@tenantId`                          | `TenantIdKey`    | not wired | not wired                | deferred to Phase 4 (RLS) — we'll fix the docs in Phase 1, no code                                 |

These six are the highest-leverage fixes because:

- API surface is settled (no design churn)
- Decorator state already validated and tested
- Failure mode today is **silent** — the worst kind for a single source of truth
- Every one of them maps to a real openlet pattern, evidenced in the audit

Plus three correctness bugs that block adoption:

- **Ent M2M owner pick is alphabetic** (`packages/typespec-ent/src/components/ent-edge.ts:111-113`) — renaming a model rotates join-table column order, breaks migrations
- **`offsetDateTime` collapses to `utcDateTime`** (`packages/typespec-orm/src/scalar-resolution.ts:46`) — offset metadata silently dropped
- **`plainDate` / `plainTime` emit as `timestamp` in Ent** — only `utcDateTime` gets the `timestamptz` schema override

Plus the missing CI integration step: today no test compiles emitted Go or imports emitted Python, so all of the above could regress without anyone noticing.

---

## Workstreams

Five parallel-safe workstreams. Each is one or two PRs. Listed in dependency order.

### W1. Wire `@check` into Ent and SQLModel

**Why:** openlet has CHECK constraints in nearly every table — `CHECK (depth BETWEEN 0 AND 10)`, `CHECK (size_bytes >= 0)`, `CHECK (status IN ('uploading','processing','ready','failed','failed_validation','size_mismatch'))`. Today these are hand-written in migrations because the decorator doesn't reach the database.

**Ent emission target.** Use `entsql.Annotation{Check: ...}` for column-level checks; for table-level checks use `entsql.Checks(map[string]string{name: expr})` annotation on the schema.

```go
// emitted ent/schema/file.go
func (File) Annotations() []schema.Annotation {
  return []schema.Annotation{
    entsql.Checks(map[string]string{
      "files_size_bytes_non_negative": "size_bytes >= 0",
      "files_status_valid":             "status IN ('uploading','processing','ready','failed','failed_validation','size_mismatch')",
    }),
  }
}
```

**SQLModel emission target.** Append to `__table_args__`:

```python
class File(SQLModel, table=True):
    __table_args__ = (
        CheckConstraint("size_bytes >= 0", name="files_size_bytes_non_negative"),
        CheckConstraint("status IN ('uploading','processing','ready','failed','failed_validation','size_mismatch')", name="files_status_valid"),
    )
```

**Files to touch.**

- `packages/typespec-ent/src/components/EntSchema.tsx` — add `entsql.Checks` annotation block when model has any field with `@check` or any model-level `@@check`. Need to introduce model-level `@@check` (extern dec, no decorator code yet — Phase 1 only handles the field-level form to keep scope tight).
- `packages/typespec-ent/src/components/ent-annotation.ts` — add `renderChecksAnnotation`.
- `packages/typespec-ent/src/imports.ts` — register `entsql` import when checks are present.
- `packages/typespec-sqlmodel/src/components/py-model-table-args.ts` — append `CheckConstraint(...)` per check.
- `packages/typespec-sqlmodel/src/components/PyImports.ts` — register `from sqlalchemy import CheckConstraint`.
- `packages/typespec-orm/src/state-types.ts` — already exposes `getCheck`; verify `NormalizedOrmField.checks?: Array<{name, expression}>` is populated.

**Testing.**

- Unit: `packages/typespec-ent/test/check.test.ts` — input `@check("c1","x>0") x: int32`, assert annotation block in output.
- Unit: `packages/typespec-sqlmodel/test/check.test.ts` — assert `CheckConstraint` in `__table_args__`.
- Snapshot: regenerate `outputs/file-vault/*` and `outputs/game-platform/*`; expect diffs because example `.tsp` files have unused `@check` decorators.
- Integration (added in W6): `go build ./...` against regenerated outputs.

**Risk:** `entsql.Checks` is documented but rarely used; verify Atlas picks it up. Fallback is column-level `entsql.Annotation{Check: ...}` per field, which Atlas definitely honors.

---

### W2. Wire `@indexUsing` into Ent

**Why:** openlet's full-text search depends on `GIN (search_vector)`. Today Ent emits a default btree index for any property with `@index` regardless of `@indexUsing`. The Postgres FTS path in `apps/file-service/internal/repo/files_search.go:15-21` would silently degrade.

**Ent emission target.** Use `entsql.IndexAnnotation{Type: "GIN"}` (or `GIST`, `BRIN`, `HASH`) on the index definition.

```go
func (File) Indexes() []ent.Index {
  return []ent.Index{
    index.Fields("search_vector").
      Annotations(entsql.IndexAnnotation{Type: "GIN"}),
  }
}
```

**Files to touch.**

- `packages/typespec-ent/src/components/ent-index.ts` — read `getIndexUsing(prop)`; if present, emit `Annotations(entsql.IndexAnnotation{Type: <upper(method)>})`.
- `packages/typespec-ent/src/imports.ts` — already imports `entsql`; reuse.
- `packages/typespec-orm/src/decorators-column.ts` (or wherever `@indexUsing` lives) — already validates method names against `["btree", "hash", "gist", "gin", "brin"]`; verify.

**Testing.**

- Unit: `packages/typespec-ent/test/index-using.test.ts` — input `@indexUsing("gin") @index search_vector: tsvector`, assert annotation.
- Snapshot: openlet's `files.search_vector` index switches from default to GIN.
- Diagnostic: emit `unsupported-index-method` warning if user passes a method Postgres doesn't support; today validation lives in the decorator (good, keep there).

**Risk:** Ent expects `index.Fields(...)` not `Columns(...)` for column-name targeting. Verify against Ent docs that `Annotations(...)` is a method on `Index` (it is).

---

### W3. Wire `@version` into Ent and SQLModel

**Why:** openlet's `ErrStaleVersion` and `If-Match` semantics in file-service depend on this. Today the property carries the marker but emitters drop it.

**Ent emission target.** Ent has no first-class `version_id_col`. Closest pattern: emit a hook that increments the version column on update.

```go
// emitted ent/schema/file.go
func (File) Hooks() []ent.Hook {
  return []ent.Hook{
    func(next ent.Mutator) ent.Mutator {
      return ent.MutateFunc(func(ctx context.Context, m ent.Mutation) (ent.Value, error) {
        if m.Op().Is(ent.OpUpdate | ent.OpUpdateOne) {
          if u, ok := m.(interface{ AddVersion(int) }); ok {
            u.AddVersion(1)
          }
        }
        return next.Mutate(ctx, m)
      })
    },
  }
}
```

For optimistic concurrency check, openlet's repo layer compares versions in WHERE clauses; that's hand-written today. We surface the column as int64 with default 0 + the increment hook. The repo can do `WHERE id = ? AND version = ?` and detect 0-row updates.

**SQLModel emission target.** Use SQLAlchemy's built-in:

```python
class File(SQLModel, table=True):
    version: int = Field(default=0, sa_column_kwargs={"nullable": False})

    __mapper_args__ = {"version_id_col": "version"}
```

**Files to touch.**

- `packages/typespec-ent/src/components/EntSchema.tsx` — when model has a `@version` property, append a Hook block. Also ensure the field is `Immutable(false)`, default 0, indexed-no.
- `packages/typespec-ent/src/components/ent-hooks.ts` (new) — render the increment hook.
- `packages/typespec-sqlmodel/src/components/PyModel.tsx` — when model has a version property, emit `__mapper_args__ = {"version_id_col": "<colname>"}`.
- `packages/typespec-orm/src/state-types.ts` — `NormalizedOrmModel.versionColumn` already exists; consume it.

**Testing.**

- Unit Ent: assert hook block emitted, version field has default 0.
- Unit SQLModel: assert `__mapper_args__` line.
- Diagnostic: error if a model has more than one `@version` property (`multiple-version-columns`).
- Diagnostic: error if `@version` property type is not `int*` (`version-must-be-int`).

**Risk:** Ent hooks are not always wanted as schema-level hooks (some teams attach at the client level). Document trade-off; offer `--version-hook-mode=schema|none` emitter option, default `schema`.

---

### W4. Wire `@audit(role)` into Ent

**Why:** openlet has identical 11-column audit_log tables in two services (`apps/auth-service/migrations/000002_audit_log.up.sql`, `apps/file-service/migrations/000003_audit_log.up.sql`). The `@audit` decorator marks fields that should be captured into audit payloads. SQLModel today writes this to `info=` dict for runtime introspection. Ent silently drops it.

**Scope decision.** Phase 1 does **not** generate the audit_log table itself (that's a Phase 2 `@@auditTable` macro). Phase 1 only surfaces the marked fields:

- Ent: emit `entsql.Annotation` with `comment("audit:<role>")` so Atlas + downstream tools can introspect, AND emit a generated `AuditFields()` static method on the schema returning the list of `(fieldName, role)` tuples for the application's audit interceptor to consume.

```go
// emitted ent/schema/file.go
func (File) AuditFields() []entaudit.Field {
  return []entaudit.Field{
    {Name: "name", Role: "data"},
    {Name: "deleted_at", Role: "lifecycle"},
  }
}
```

This requires a tiny runtime helper package shipped alongside emitted Ent — `packages/typespec-ent/runtime/auditfield.go` (copied to standalone output). openlet writes its own audit interceptor that reads this method.

- SQLModel: already wired via `info=` dict; no change. Optionally add a class-level `__audit_fields__: ClassVar[list[AuditField]]` for symmetry with Ent.

**Files to touch.**

- `packages/typespec-ent/src/components/EntSchema.tsx` — when any field has `@audit`, render the static method.
- `packages/typespec-ent/runtime/` (new) — minimal Go package with `entaudit.Field` struct, copied into standalone output.
- `packages/typespec-ent/src/emitter.tsx` — copy runtime files when standalone mode is on.
- `packages/typespec-sqlmodel/src/components/PyModel.tsx` — add `__audit_fields__: ClassVar[list[tuple[str,str]]] = [...]`.

**Testing.**

- Unit: assert generated `AuditFields()` method contains the right entries.
- Snapshot: regenerate openlet-shaped fixture.
- Integration (W6): `go build` succeeds with the runtime package present.

**Risk:** introduces a runtime helper package, which is the first time `typespec-ent` ships Go code. Keep it tiny (single struct, ~20 lines) so it's auditable and stable.

---

### W5. Wire `@polymorphic(allowed[], idColumn?)`

**Why:** openlet uses `(principal_type, principal_id)` in 6+ tables. Today the decorator is purely metadata. We need:

- A CHECK constraint enforcing `type IN (allowed)`.
- A compound index on `(type, id)` (already partially handled by manual `@@tableIndex`, but should be implicit).
- The relation resolver should treat polymorphic FKs as legitimate (no `unsupported-relation-shape` diagnostic).

**Ent emission target.**

```go
// emitted from @polymorphic(["user","service_account"]) on `owner` relation
// with @map("owner_principal_type") + companion id column "owner_principal_id"

func (Workspace) Annotations() []schema.Annotation {
  return []schema.Annotation{
    entsql.Checks(map[string]string{
      "workspaces_owner_principal_type_valid": "owner_principal_type IN ('user','service_account')",
    }),
  }
}

func (Workspace) Indexes() []ent.Index {
  return []ent.Index{
    index.Fields("owner_principal_type", "owner_principal_id"),
  }
}
```

The relation property itself is not converted to an Ent edge — Ent edges require a single concrete table on the other end. The polymorphic relation surfaces only as the two scalar columns + the CHECK + the index. The runtime layer does the dispatch.

**SQLModel emission target.** Same: emit two columns + `CheckConstraint(...)` in `__table_args__` + `Index(...)` in `__table_args__`. No SQLAlchemy relationship().

**Decorator semantics to lock in this phase.**

```typespec
@polymorphic(["user", "service_account"], "owner_principal_id")
@map("owner_principal_type")
ownerType: "user" | "service_account";

ownerId: uuid;
```

Or as a paired primitive once we add Phase 2's `@@principal` macro. Phase 1 only handles the explicit two-property form.

**Files to touch.**

- `packages/typespec-orm/src/relations-resolution.ts` — accept polymorphic config; do not error on missing FK target when `getPolymorphicConfig` is set.
- `packages/typespec-orm/src/validators-relations.ts` — verify `idColumn` exists, type is uuid/int.
- `packages/typespec-ent/src/components/EntSchema.tsx` — emit CHECK + index when polymorphic config present.
- `packages/typespec-sqlmodel/src/components/py-model-table-args.ts` — same.
- `packages/typespec-orm/src/diagnostics.ts` — new code `polymorphic-id-column-not-found`.

**Testing.**

- Unit: input matching openlet's `workspaces` shape; assert CHECK + index.
- Unit: invalid `idColumn` raises diagnostic.
- Integration: regenerate openlet fixture, diff against hand-written migration.

**Risk:** The decorator currently takes `(allowed[], idColumn?)`. We're adding semantic weight to a decorator already shipped with v1.x. If anyone is depending on it being a no-op, this is a behavior change. Grep usage in `examples/`, `outputs/` — currently zero call sites, so safe to treat as minor-version upgrade.

---

### W6. Bug fixes (M2M owner pick, scalar collapses)

Three correctness fixes that piggyback on the same release.

**6a. M2M alphabetic owner pick.**

Today `packages/typespec-ent/src/components/ent-edge.ts:111-113`:

```ts
const owner = sortedSides.sort((a, b) => a.modelName.localeCompare(b.modelName))[0];
```

Renaming a model can flip ownership and rotate join-table column order, breaking migrations.

**Fix.** Introduce `@manyToManyOwner` decorator (extern dec, opt-in). When neither side has it:

- Emit `m2m-owner-ambiguous` warning naming both sides
- Fall back to alphabetic for backwards compat
- Document migration: add `@manyToManyOwner` to existing M2M relations to lock current owner

**Files.**

- `packages/typespec-orm/lib/main.tsp` — declare `@manyToManyOwner`.
- `packages/typespec-orm/src/decorators-relations.ts` — store on state.
- `packages/typespec-orm/src/state-types.ts` — surface in normalized M2M.
- `packages/typespec-ent/src/components/ent-edge.ts:111` — consume; warn when missing.

**6b. `offsetDateTime` collapses to `utcDateTime`.**

`packages/typespec-orm/src/scalar-resolution.ts:46` maps `offsetDateTime` → `utcDateTime` in `STANDARD_SCALAR_MAP`. Offset is silently lost.

**Fix.** Add explicit branch:

- Ent: emit `field.Time` with SchemaType override `{Postgres: "timestamptz"}`. Same as utcDateTime today, BUT add a comment annotation `// Offset preserved by application layer (TZ in connection)`.
- SQLModel: emit `datetime` with `sa_column=Column(DateTime(timezone=True))`.
- Zod: emit `z.iso.datetime({offset: true})`.
- DBML: keep `timestamptz`.
- Add a documented limitation note in `docs/scalar-mapping.md`: Postgres has no native fixed-offset type; offset is a connection-level concern.

This is a docs+test fix more than a code fix — current behavior is essentially correct, but the audit flagged it because the loss is silent. Make it loud (mention in lib README + TS doc string on the scalar) and add a test that pins the behavior.

**6c. `plainDate` / `plainTime` emit as `timestamp` in Ent.**

`packages/typespec-ent/src/components/ent-field.ts:117-122` only adds `timestamptz` SchemaType for `utcDateTime`. `plainDate` falls through to default `field.Time`, which Atlas reads as `timestamp`.

**Fix.** Branch on scalar:

- `plainDate` → `field.Time` + SchemaType `{Postgres: "date"}`.
- `plainTime` → `field.Time` + SchemaType `{Postgres: "time"}`.

**Files.**

- `packages/typespec-ent/src/components/ent-field.ts:117-130` — extend the SchemaType branch.

**Testing.** Unit test for each scalar; snapshot diff in examples.

---

### W7. CI integration tests

**Why:** none of the above changes can be trusted without a CI step that compiles emitted code.

**New CI jobs.**

1. **Go compile check.** After `pnpm run compile-examples`, `cd outputs/file-vault/<svc> && go mod tidy && go build ./... && go vet ./...` for every Go service. Fails on any compile error.
2. **`ent generate` runs.** `cd outputs/file-vault/<svc> && go run -mod=mod entgo.io/ent/cmd/ent generate ./ent/schema` — proves the emitted schemas are valid Ent input. Then re-`go build` to ensure generated runtime compiles.
3. **Python import check.** `cd outputs/file-vault/<svc> && python -c "import importlib, pkgutil; pkg = importlib.import_module('<libname>'); [importlib.import_module(m.name) for m in pkgutil.walk_packages(pkg.__path__, pkg.__name__+'.')]"`. Catches import errors, syntax errors, missing imports.
4. **Zod runtime check.** `cd outputs/file-vault/frontend && pnpm install && pnpm tsc --noEmit && node -e "require('./dist').<SomeSchema>.parse({...})"` — proves emitted schemas execute against representative payloads.
5. **DBML lint.** `dbml2sql --postgres outputs/.../*.dbml > /dev/null` — no SQL emission needed, just parse-check.

**Files.**

- `.github/workflows/ci.yml` — add jobs after the existing `compile-examples`.
- `scripts/integration/go-build.sh`, `python-import.sh`, `zod-runtime.sh` — new helpers.
- `package.json` — `"test:integration": "scripts/integration/run-all.sh"`.

**Risk.** CI gets slower (adds ~3–5 min per Go service). Mitigate with parallel jobs and `if: contains(...changed...)` filters.

---

## Decorator-surface cleanups (docs only)

Phase 1 also fixes README claims for things we are NOT implementing yet. Truth-in-advertising:

- `@tenantId` doc string → strike "RLS scaffolding"; mark "metadata-only; consumed by Phase 4".
- `@indexUsing` doc string → "supported in Ent and SQLModel for postgres-only methods (gin, gist, brin, btree, hash)" once W2 lands.
- `lib.ts:46-49` description blocks updated to reflect actual emitter behavior.

Files: `packages/typespec-orm/lib/main.tsp` doc strings, `packages/typespec-orm/src/lib.ts` state descriptions, `README.md` feature matrix.

---

## Migration & rollout

**Versioning.** This phase is `0.x` minor bumps for typespec-ent, typespec-sqlmodel, typespec-orm. Behavior changes are additive (CHECKs that did nothing now do something). The one near-breaking change is `@polymorphic` going from no-op to constraint-emitting; mark in CHANGELOG, no semver-major needed because the decorator was documented to do this.

**Order of merges.**

1. W6 bug fixes (smallest, lowest risk, build trust)
2. W7 CI integration tests (catches regressions for everything else)
3. W1 `@check` (validates the integration tests actually exercise emitted output)
4. W2 `@indexUsing`
5. W3 `@version`
6. W4 `@audit`
7. W5 `@polymorphic`

**openlet adoption checklist (after Phase 1 ships).**

- Add `@check` decorators to openlet TypeSpec sources mirroring existing migrations
- Add `@indexUsing("gin")` to `search_vector`
- Add `@version` to mutable resources (workspace, folder, file metadata)
- Add `@audit` to fields the audit_log already captures
- Convert `(principal_type, principal_id)` pairs to use `@polymorphic`
- Run `ent generate` for the first time; commit `ent/` runtime to repo
- Diff emitted migrations vs hand-written; reconcile (likely small naming differences)

**Acceptance gate to leave Phase 1.** All of:

- ✅ All seven workstream PRs merged
- ✅ CI integration tests green (W7) covering both `examples/` projects
- ✅ openlet auth-service migrated to use generated Ent schemas with @check, @indexUsing, @version, @audit, @polymorphic — diff against hand-written migrations is empty modulo cosmetic differences
- ✅ Decorator docs match implementation (no aspirational claims in README)

---

## Risks & mitigations

| Risk                                                         | Likelihood | Impact | Mitigation                                                              |
| ------------------------------------------------------------ | ---------- | ------ | ----------------------------------------------------------------------- | ----- | ---- | --------------------------- |
| Ent annotation API changes between minor versions            | low        | medium | pin Ent version in emitter peer-deps; integration test catches breakage |
| `entsql.Checks` not honored by Atlas in some setups          | medium     | medium | fallback to per-column `entsql.Annotation{Check: ...}`; document        |
| `@audit` runtime helper package becomes a maintenance burden | medium     | low    | keep ≤30 LoC, no transitive deps, freeze API                            |
| Polymorphic CHECK fights existing hand-written migrations    | high       | medium | provide `--polymorphic-emit=check                                       | index | both | none`opt-out; default`both` |
| openlet can't actually run `ent generate` cleanly            | medium     | high   | pre-flight on a throwaway branch before merging the migration PR        |
| Integration tests inflate CI time past tolerance             | medium     | low    | parallelize, gate on path filters, cache `go mod` and `pip`             |

---

## Open questions for user

1. **Ent runtime adoption.** openlet currently has Ent schemas but no `ent/` generated runtime. Phase 1's value is partially gated on actually running `ent generate`. Confirm: openlet starts running `ent generate` as part of this phase, even though current pgx repo code stays?
2. **`@audit` runtime package shape.** Are you OK with `typespec-ent` shipping a tiny Go runtime helper (`entaudit.Field` struct), or would you rather emit raw struct literals with no shared dependency?
3. **`@manyToManyOwner` opt-in.** Default to alphabetic-with-warning, or hard-error on missing? Hard-error is louder but breaks current `examples/`.
4. **`@version` hook mode.** Schema-level Ent hook (auto-increment on every update), or emit only the column and let the application layer increment? Schema-level is convenient; some teams prefer explicit.

Resolve these before W3 / W4 / W6a start.
