# typespec-libraries — Long-Term Viability Report for Openlet

**Date:** 2026-05-22
**Subject project:** Openlet — AI-driven file management SaaS (see `openlet.md`)
**Library under evaluation:** `qninhdt/typespec-libraries` @ commit `b866467` (branch `dev`)
**Method:** Four parallel deep-dive agents over `packages/{typespec-orm, typespec-ent, typespec-zod, typespec-sqlmodel, typespec-dbml}`, generated outputs in `outputs/`, and repo-wide signals (CI, CHANGELOG, git log, docs).

---

## TL;DR

**Conditional yes — usable as schema source-of-truth for Openlet, but with three structural gaps and one ownership risk that you must accept up front.**

| Dimension                          | Verdict                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------- |
| Coverage of Openlet's domain model | ~75% — core CRUD/relations/indexes/checks all work                                          |
| Generated output quality           | High — Go and Python output is idiomatic and CI-verified                                    |
| Test rigor                         | Mixed — ORM core 131 tests, SQLModel 176 tests, Zod 17 files, **Ent only ~10 active tests** |
| Stability of the API surface       | Low — three breaking releases in 2 months (0.3 → 0.4 → 0.5)                                 |
| Bus factor                         | **1** — single author, AI-assisted, no external contributors                                |
| Long-term commitment cost          | Plan to **fork or vendor within 6 months** if Openlet adopts at scale                       |

The library is genuinely the cleanest TypeSpec-to-ORM-emitter stack reviewed. The risk is not technical mediocrity — it is institutional: a 0.x personal project that you would be making load-bearing in a multi-service production system. Adopt with a fork-readiness plan.

---

## 1. Methodology

Four read-only agents explored:

1. `typespec-orm` (shared core) + `typespec-dbml` + repo-wide signals
2. `typespec-ent` (highest stakes — 5 Go services depend on it)
3. `typespec-zod` (Next.js frontend)
4. `typespec-sqlmodel` + `typespec-gorm`

Each agent inspected source, tests, generated outputs in `outputs/`, the canonical examples (`file-vault`, `game-platform`), CHANGELOG, and git history. Findings cross-referenced against Openlet's locked decisions in `openlet.md` §2 and §4.

---

## 2. Per-Package Assessment

### 2.1 `@qninhdt/typespec-orm` — shared core

The heart of the system. Every emitter consumes its normalized graph; if this is weak, everything downstream is weak.

**Decorator surface** (`packages/typespec-orm/src/lib.ts:318-381`): 30+ user-facing decorators registered via `$decorators` map (`src/index.ts:95-129`):

- Structural: `@table`, `@tableMixin`, `@map`, `@ignore`, `@schema`, `@@tableIndex`, `@@tableUnique`
- Constraints: `@key`, `@index`, `@unique`, `@check(name, expr)`, `@precision(p, s)`
- Relations: `@foreignKey(field, referencedField?)`, `@mappedBy(field)`, `@manyToMany(joinTable)`, `@onDelete`, `@onUpdate`
- Lifecycle: `@autoIncrement`, `@autoCreateTime`, `@autoUpdateTime`, `@softDelete`, `@defaultExpression(sql)`
- Multi-tenant / ops: `@version`, `@tenantId`, `@audit("createdBy"|"updatedBy")`
- Catalog: `@scope`, `@owner`, `@classification`
- Form/DTO: `@data`, `@title`, `@placeholder`, `@inputType`

`@foreignKey` accepting an optional `referencedField` is a real plus — non-PK FK targets work, which matters for Openlet's `@table Organization { @key @unique code: string }` pattern.

**Validation rigor** (`src/lib.ts:8-316`, `src/validators.ts`): 40 errors + 11 warnings. Layered pipeline (`validators.ts:82-110`): duplicate-table → per-model checks → cascade-on-scalar → FK-without-index → relation+m2m → PG-reserved-word → namespace/mixin/dep-shape via `normalizeOrmGraph`.

Subtle catches that show real engineering thought:

- `foreign-key-set-null-non-nullable` (`validators.ts:807-820`)
- `one-to-one-missing-unique` (`validators.ts:1040-1061`)
- `mixin-cycle` (`normalization.ts:555-582`)
- `mixin-field-conflict` — child override is **error**, not silent override (`normalization.ts:584-615`)
- `filtered-dependency` — emitter dies if `include`/`exclude` discards a transitively required model (`normalization.ts:352-378`)
- `pg-reserved-identifier` — table/column/index/unique names checked (`validators.ts:413-462`)

**Selector / filter system** (`src/normalization.ts:316-395`): Strongest part of the codebase. Supports name selectors **and** `#scope` tags (`normalization.ts:397-407`), with transitive-closure walker when `auto-include-dependencies: true`. Cross-namespace FKs (frontend → `Accounts.User`) resolve correctly because `collectDependencies` (`normalization.ts:617-648`) traverses relations, mixins, scalars, enums, tuples, unions. Tested in `normalization.test.ts:419-494`.

**Relation resolution** — what works, what doesn't:

| Pattern                                                                       | Status | Notes                                                                   |
| ----------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------- |
| Many-to-one / one-to-one                                                      | ✅     | `resolveDirectRelation` + uniqueness check (`relations.ts:186-199`)     |
| One-to-many / has-one inverse via `@mappedBy`                                 | ✅     | `relations.ts:496-541`                                                  |
| Many-to-many shorthand                                                        | ✅     | `@manyToMany("name")` on both sides (`relations.ts:292-353`)            |
| Self-references (folder.parent_folder_id)                                     | ⚠️     | Structurally fine, **no test coverage**, no example                     |
| Optional vs required relations                                                | ✅     | Carried through `prop.optional`                                         |
| **Polymorphic FKs** (Openlet's `owner_principal_type` + `owner_principal_id`) | ❌     | **No first-class support.** No `@polymorphic`, no discriminator concept |
| M2M with payload columns                                                      | ⚠️     | Shorthand can't carry payload — must declare explicit junction `@table` |

**Test coverage:** 131 tests across 8 files. Heaviest: `validators.test.ts` (38 tests, 822 lines), `normalization.test.ts` (18 tests, 596 lines), `decorators.test.ts` (30 tests). All headline diagnostics covered.

**Stability signals:** `CHANGELOG.md` shows real API thrash:

- `0.3.0` removed `@id` for TypeSpec `@key`, removed auto-relation generation, renamed `@compositeUnique → @compositeKey`
- `0.4.0` added `@data`-family + new emitters
- `0.5.0` namespace-first rewrite breaking flat-layout assumptions

**Three breaking releases in two months. Single author. Bus factor 1.**

**Verdict — ORM core:** Excellent design, sharp diagnostics, exemplary cross-namespace handling. Polymorphic FK gap propagates into every downstream emitter. M2M-with-payload and self-reference edges have lower confidence than the rest.

---

### 2.2 `@qninhdt/typespec-ent` — highest stakes for Openlet

**Snapshot:** v0.5.0, ~1,269 LoC across 16 files in `src/`, ~600 LoC of TS in `test/` with **only ~10 active emitter assertions** in `test/emitter.test.ts`. The `dist/test/` tree shows .d.ts files for richer test suites that no longer exist in source — they were compiled in the past. CI compensates by running `go build` against generated output for both example projects, which catches structural breakage but not semantic regressions in field/edge construction.

✅ **Strengths**

- **Mixins** (`@tableMixin` → `mixin.Schema`) — composes cleanly via `Mixin()`. Verified in `outputs/game-platform/.../timestamped.go`.
- **Native PostgreSQL enums** — `ent-field.ts:101-114` emits `SchemaType` + `entsql.Annotation{Type: ...}` so Atlas creates real `CREATE TYPE foo AS ENUM(...)`, not CHECK-string columns.
- **Named check constraints** — `ent-annotation.ts:30-43` emits `Checks: map[string]string{...}` on the table annotation. Confirmed in `user.go:24` (`users_credits_non_negative`).
- **Indexes** — standalone, composite, composite-unique all supported (`ent-index.ts`, `ent-composite.ts`).
- **Edges** — 1-1, M-1, 1-N, M-N shorthand (`ent-edge.ts:84-150`). Deterministic owner-side selection. `OnDelete` correctly maps to `entsql.Cascade/SetNull/Restrict/NoAction` (`ent-edge.ts:182-194`).
- **Multi-service / per-service codegen** — `outputs/file-vault/` proves it: 7 services each with their own `ent/schema/`, `atlas.hcl`, `go.mod`. **This directly maps to Openlet's 5-Go-service split.**
- **Atlas integration** — `emitter.js:213-228` emits a working `atlas.hcl` (ent://ent/schema source, configurable schemas, `docker://postgres/16/dev` dev URL).
- **`utcDateTime` → `timestamptz`** forced via `SchemaType` (`ent-field.ts:227-232`). Many emitters get this wrong; this one doesn't.
- **Soft-delete + auto timestamps** — `@autoCreateTime`/`@autoUpdateTime` produce `Default(time.Now)`/`UpdateDefault(time.Now)`/`Immutable()`; soft-delete column gets automatic index.
- **Generated Go is idiomatic.** A senior Go dev would accept output of `world.go`, `user.go`, `audit_log.go` without complaint.

⚠️ **Gaps**

- **JSONB columns are weakly typed.** `ent-field.ts:163-164` always emits `field.JSON("col", map[string]any{})`. No path to a strongly typed Go struct for `args JSONB`, `result JSONB`, `payload JSONB`. Functional, just unergonomic.
- **No partial / WHERE / functional indexes.** `ent-index.ts` only knows `index.Fields(...)` plus `Unique()`. Ent itself supports `Annotations(entsql.IndexWhere(...))`, but the emitter doesn't surface that.
- **No `field.Other` / custom GoType decorator.** `decimal` is hardcoded; everything else uses built-in mappings. No `@goType("github.com/foo/bar.MyType")`.
- **No hooks / policy / privacy emission.** Zero output for Ent's hook, policy, or privacy systems. _Not fatal_ — Ent is designed so these go in side-files (`ent/schema/<entity>_hooks.go`) that survive regen — but the emitter contributes nothing here.
- **Tests are thin.** ~10 active emitter assertions. CI compiles generated Go, which catches structural breakage but not semantic regressions.

❌ **Blockers for Openlet**

1. **Polymorphic `(owner_principal_type, owner_principal_id)` cannot be modeled with FKs.** `ent-edge.ts:69-82` rejects FKs targeting non-`@key` columns (`referenced-column-fk-not-supported-by-ent`). This is an Ent limitation, not unique to this emitter — but it means workspaces, workspace_members, folders, files (every table using polymorphic-owner in `openlet.md` §4) loses referential integrity. Workaround: model the two columns as plain scalars + `@check` constraint; enforce in service layer.

2. **TSVector / GIN for FTS is not first-class.** `tsvector` is registered as a scalar in `packages/typespec-orm/src/scalar-resolution.ts`, but the Ent emitter has no `tsvector` branch in `ent-field.ts`'s switch and no GIN-index handling. The column falls into `default` and emits as `field.String(...)` — that won't produce a `TSVECTOR` Postgres column. Workaround: hand-stitch `field.Other(...).SchemaType(...)` and `entsql.Annotation` for the GIN index in a side-file that survives regen.

3. **Cross-service foreign keys are explicitly rejected.** `ent-edge.ts:46-64` reports `cross-package-edge` as an error when source/target sit in different namespaces (i.e., different services). Openlet's `notif_*` → `user_id`, `file_*` → `workspace_id`, `leti_*` → `user_id` cannot be modeled as edges. Workaround: model as plain UUID scalars without FK; integrity enforced via Atlas/SQL or accept eventual consistency. _This is the realistic pattern for service-isolated Postgres anyway_, but be aware: the emitter is not helping you generate cross-service joins.

4. **`@onUpdate(CASCADE)` is dropped.** `ent-edge.ts:155-168` — Ent doesn't expose ON UPDATE through its annotation API. Escape hatch (`on-update-emit-raw-sql: true`) only injects a `Comment("on_update: ...")` marker for downstream Atlas custom rules — it does not generate the SQL trigger.

🔧 **Workarounds map (Openlet schema)**

| Openlet need                                     | Workaround                                                                                                              |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `leti_tool_calls.args/result JSONB`              | `field.JSON(...)` with `map[string]any{}` + hand-written typed accessors in hooks file                                  |
| `files.search_vector TSVECTOR` + GIN             | Hand-authored `ent/schema/file_search.go` with `field.Other(...)` + `entsql.IndexAnnotation{Types: {"postgres":"GIN"}}` |
| `workspaces.owner_principal_*`                   | `ownerPrincipalType` enum + `ownerPrincipalId` UUID scalar + `@check("workspaces_owner_valid", ...)` — no FK            |
| Cross-service `user_id` references in notif/leti | Plain UUID scalars; no FK                                                                                               |
| RFC 8693 token grants, audit logs                | Standard tables, well within emitter capabilities                                                                       |

**Verdict — Ent:** Conditional yes. Covers ~70-80% of `openlet.md` §4 cleanly. The other 20-30% is workarounds in side-files. The per-service codegen story is genuinely the strongest reason to adopt — manually maintaining 5 Ent schemas would be worse. Plan to fork the emitter within 6 months for `@goType`, partial-index annotations, and tsvector/GIN first-class support.

---

### 2.3 `@qninhdt/typespec-zod` — Next.js frontend

**Version:** 0.5.0. **Zod major: 4.x only** (`peerDependencies.zod: "^4.0.0"` in `package.json:67`). Emitter uses `z.email()`, `z.url()`, `z.iso.datetime()`, `z.uuid()` — all top-level Zod 4 forms. **Zod 3 will not work.**

✅ **Strengths**

- **Full scalar coverage** (`scalar-base.tsx`, `model-base.tsx`, `union-base.tsx`): all integer widths, float, decimal (regex-validated string for precision — `scalar-base.tsx:61-67`), uuid, email, url, ipv4/ipv6/ip/cidr, base64, cuid/cuid2/ulid/nanoid, jwt, emoji, bytes → `z.instanceof(Uint8Array)`, dates with encoding awareness (`scalar-base.tsx:34-48`).
- **`int64`/`uint64` configurable** via `int64-strategy: "string" | "bigint" | "number"` (`lib.ts:20-28`, default `"string"` — lossless over JSON).
- **Discriminated unions are first-class** — `z.discriminatedUnion("kind", [...])` with `envelope: "object"` support (`union-base.tsx:14-52`, `p2-polish.test.ts:80-105`). **This directly satisfies Openlet's `Principal = UserPrincipal | ServiceAccountPrincipal` shape.**
- **Enums:** string enums → `z.enum([...])`, numeric enums → `z.union([z.literal(0), ...])` (`enums.test.tsx:23,65`).
- **Nested objects, arrays** (`@minItems`/`@maxItems`), tuples, records (rendered as `z.intersection(z.object(...), z.record(...))` when both shape and indexer exist — `model-base.tsx:148-150`).
- **String/numeric constraints:** `@minLength`/`@maxLength`/`@pattern`/`@format`, `@minValue`/`@maxValue`/`@minValueExclusive`/`@maxValueExclusive`/`@multipleOf`.
- **Form metadata** (`components/ZodMetaFile.tsx`, `components/meta-builder.ts`) — per-model `${Name}Meta: Record<string, FormFieldMeta>` with rich keys (`title`, `placeholder`, `inputType`, `min`, `max`, `regex`, `description`, `required`, `secret`, `multiline`, `format`, `multipleOf`). **Drops directly into Shadcn + react-hook-form.**
- **Standalone mode** (`emitter.tsx:50-89`) — emits `package.json` (Node ≥20), `tsconfig.json` with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, ESM, sideEffects-free. Polished publishable npm output verified at `outputs/file-vault/frontend/zod/` and `outputs/game-platform/frontend/zod/`.
- **17 test files** including a 19 KB `scalars.test.tsx`. Vitest with v8 coverage configured.

⚠️ **Gaps**

- **`@table` models are NOT emitted as Zod** (`README.md:248-250`). Only `@data` and `@tableMixin` make it out. So `User`, `File`, `Workspace`, `LetiMessage` (table-shaped) won't yield Zod schemas/types directly. Pattern in the example outputs (`outputs/file-vault/frontend/zod/src/file_vault/identity/AccountView.ts`) is to define explicit `@data` view models (`AccountView`, `SessionView`) that mirror the table shape, using lookup types (`email: User.email`) to inherit per-field constraints. Workable, but the frontend does **not** auto-share backend table types.
- **FK to non-`id` column flattens to scalar** (`p2-polish.test.ts:163-198`). `organizationCode: Organization.code` becomes plain `z.string()`, no relationship preserved. Fine for forms.

❌ **Real gaps**

- **No `@check` → `.refine()` emission.** `@check` is defined in ORM core (`packages/typespec-orm/src/decorators.ts:66`), but Zod emitter doesn't surface custom predicate refinements. Cross-field rules (`startDate < endDate`, password match) must be hand-written on top of the generated schema.
- **No top-level `.refine` for object-level invariants** — only field-level constraint chains.

🔧 **Openlet-specific verdict by concern**

| Concern                                                                      | Status                                                                                               |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| TS types shared frontend↔backend for `User`/`File`/`Workspace`/`LetiMessage` | Need explicit `@data` view models (e.g. `UserView`, `WorkspaceView`); not auto-emitted from `@table` |
| `Principal = UserPrincipal \| ServiceAccountPrincipal`                       | ✅ Supported via `@discriminated(#{ envelope: "object" })`                                           |
| `@scope("frontend")` cross-cutting selector                                  | Decorator exists in ORM; verify it works as Zod include axis or use namespace partitioning           |
| Shadcn + react-hook-form integration                                         | ✅ Direct fit — `${Name}Meta` is `Record<string, FormFieldMeta>`                                     |
| Workspace/file/share/settings/search forms                                   | ✅ All idiomatic `@data` form territory                                                              |
| Leti chat streaming                                                          | Out of scope; emitter is for forms/DTOs, not protocols                                               |

**Verdict — Zod:** Mature enough for Openlet's forms and DTO surface, with two design accommodations: (1) commit to Zod 4 in Next.js; (2) frontend types come from explicit `@data` view models, not from `@table`. Compose `@check`-style refinements in handwritten TS layered on top.

---

### 2.4 `@qninhdt/typespec-sqlmodel` — Python services

Used by Openlet's `file-worker` and `leti-service`.

✅ **Strengths**

- **Full PG scalar mapping** (`PyConstants.ts:140-146`): UUID emits `PG_UUID(as_uuid=True)`, datetime emits `DateTime(timezone=True)`, decimal supports `@precision(p, s)` (`PyField.tsx:163`).
- **Relationships:** 1-1 / 1-N use `@foreignKey` + paired `Relationship()`. M-N via `@manyToMany("table_name")` shorthand → generates `__associations__.py` with `secondary=...` (`PyModel.tsx:417-430`). Inverse pairing via `@mappedBy`.
- **Referenced-column FKs** carried through into `ForeignKey("table.col")` (`PyModel.tsx:442-447`).
- **Check constraints** → `CheckConstraint` inside `__table_args__` (`PyModel.tsx:262-270`).
- **Indexes:** column `@index`/`@unique`, plus model-level `@@tableIndex(columns, name)` and `@@tableUnique` → `Index(...)` / `UniqueConstraint(...)` (`PyModel.tsx:227-253`).
- **Defaults:** literal Python defaults, plus `@defaultExpression(...)` for raw SQL (`packages/typespec-orm/lib/main.tsp:298`). Visible in `processing_job.py:47-49` (`server_default="queued"`).
- **`@tableMixin`** → plain `SQLModel` bases imported into derived tables.
- **Async/sync agnostic** — emits only model classes, no `Session`/`AsyncSession` wiring. Either works.
- **Pydantic v2** with `Annotated[int, Field(ge=1, le=100)]` style. SQLModel ≥ 0.0.14.
- **Atlas integration** — each service emits a real `atlas.hcl` (verified at `outputs/file-vault/processing-svc/sqlmodel/atlas.hcl`) wired to `atlas-provider-sqlalchemy` with `dialect = postgresql`. Same flow as Ent. Alembic not required (but unblocked — `target_metadata = SQLModel.metadata` is exported).
- **176 `it()` blocks across 16 files**, 3,325 lines total. CI runs `python -m compileall outputs/...` to confirm generated Python parses.
- **Generated output is production-grade.** `from __future__ import annotations` always first; imports sorted/grouped; cross-namespace FKs work (`processing_job.py:44` references `"file_metadata.id"` via `TYPE_CHECKING` import); soft-delete and `@version` get proper `__mapper_args__`; enums emitted as `(str, Enum)` subclasses with `SAEnum(...)` columns.

⚠️ **Gaps**

- **No arbitrary SA Column kwargs passthrough.** No generic decorator to inject `sa_column_kwargs`. `server_default=func.now()` only emits for `@autoCreateTime`/`@autoUpdateTime`. Anything beyond built-in decorators (`@autoIncrement`, `@autoCreateTime`, `@autoUpdateTime`, `@version`, `@softDelete`, `@defaultExpression`) is unreachable.
- **Cross-service schemas duplicate via dependency pull.** Each service emits all _transitively required_ models from other namespaces. `file_vault/processing-svc/sqlmodel/file_vault/metadata/file_metadata.py` is the worker's local copy of file-service's table, used as the FK target. Two consequences:
  1. The same physical Postgres database must back both services for the FKs to be real.
  2. Source schema duplication — if file-service changes `file_metadata`, both services regenerate. **No mechanism for "import this table from another service's published package."**

  Fine if Openlet uses one shared DB (typical SaaS). Problem if file-service has its own DB.

| Feature            | Status                                                                                    |
| ------------------ | ----------------------------------------------------------------------------------------- |
| JSONB              | ✅ `collection-strategy: "jsonb"` (`py-field-array.ts:65-67`) and direct `JSONB` scalar   |
| ARRAY              | ✅ `collection-strategy: "postgres"` (`py-field-array.ts:71-72`)                          |
| TSVECTOR           | 🔧 Scalar exists in ORM, but no native Pydantic mapping. Workable via custom scalar alias |
| GIN indexes        | ❌ Index emission has no `using="gin"` knob                                               |
| Partial indexes    | ❌ No `where=...` support                                                                 |
| Expression indexes | ❌ Not modeled                                                                            |

🔧 **Openlet-specific feasibility**

- ✅ `leti_sessions(workspace_scope_ids JSONB)` — `string[]` + `collection-strategy: "jsonb"` produces `Column(JSONB)`.
- ✅ `leti_tool_calls(args JSONB, result JSONB, status check enum)` — JSONB scalars + enum (preferred) or `@check` for SQL CHECK.
- ⚠️ Cross-service FKs work only if shared DB.

**Verdict — SQLModel:** Mature enough for Openlet's `file-worker` and `leti-service`. The two rough edges (no GIN, no SA passthrough) are workable: Atlas migrations can hand-add GIN indexes post-generation. If Postgres FTS becomes central, expect to maintain custom Atlas migration files alongside generated schema.

---

### 2.5 `@qninhdt/typespec-gorm` — already removed

Package directory does not exist. `pnpm-workspace.yaml` lists `packages/*` only. Repo `README.md` confirms: _"local `@qninhdt/typespec-protobuf` and GORM directions were removed"_. `CHANGELOG.md` references it only historically.

**Verdict — gorm:** Not relevant. Openlet rejected GORM anyway. Zero dead weight in monorepo. No risk, no maintenance burden.

---

### 2.6 `@qninhdt/typespec-dbml` — documentation-only for Openlet

The bar is "renders cleanly on dbdocs/dbdiagram." It clears it.

✅ **Strengths**

- `Project ... { database_type: 'PostgreSQL' }` block at top (`emitter.tsx:117-122`)
- Enums hoisted globally and deduped (`emitter.tsx:127-142`) — survives same enum across namespaces
- Per-namespace `// Namespace: X` headers + `TableGroup` blocks for dbdiagram visual grouping (`emitter.tsx:160-179`)
- Refs emitted separately at bottom (DBML idiom)
- `split-by-namespace` mode — one file per namespace with its own Project header
- Composite uniques rendered correctly (`outputs/file-vault/docs/dbml/schema.dbml:191`)
- 84 tests across 12 files

⚠️ **Gaps**

- DBML language has no first-class CHECK constraint, so named `@check(...)` constraints are likely dropped or rendered as table notes. Verify before relying on dbdocs as design-of-record.
- FK ON DELETE/UPDATE actions: DBML supports `[delete: cascade]` on Refs — emitter present but worth a 2-min spot check.

**Verdict — DBML:** Solid. Use it for `docs` output as designed.

---

## 3. Cross-Cutting Concerns

### 3.1 Bus factor and ownership

- Every commit by single author (Nguyen Quang Ninh / `qninhdt`)
- README footer admits AI-assisted authoring (GPT-5.4, Claude Opus 4.6)
- No external PRs, no public users beyond example outputs in this monorepo
- No GitHub issue tracker activity
- No tagged releases visible in git, only CHANGELOG entries
- Recent git log reads like a refactor sprint: `refactor: remove shit`, `fix some bugs`, `refactor all packages`, `Updates`

**Risk:** Maintenance stalls. Critical Openlet bugfixes blocked on a single person.
**Mitigation:** Vendor packages (copy `node_modules/@qninhdt/*` into `packages/vendor/` and patch in place), or fork the monorepo into Openlet's org.

### 3.2 API stability

Three breaking releases in two months (March 2026):

- `0.3.0` — removed `@id` for TypeSpec `@key`, removed auto-relation generation, renamed `@compositeUnique → @compositeKey`
- `0.4.0` — added `@data`-family + new emitters
- `0.5.0` — namespace-first rewrite breaking flat-layout assumptions

Each migration is documented in CHANGELOG, but the cadence shows the design is still being discovered, not stabilized. Pre-1.0 semver — minor bumps may be breaking.

**Risk:** Library upgrades during Openlet's 12-week MVP delivery cause schedule slips.
**Mitigation:** Pin to exact version. Re-evaluate upgrades quarterly, not opportunistically.

### 3.3 Upstream dependency churn

- Built on `@alloy-js/core` (0.22 — pre-1.0) and `@typespec/emitter-framework`
- TypeSpec compiler itself is still pre-1.0
- Both upstreams will reach this package via breaking changes

**Risk:** Churn from any of three pre-1.0 dependencies (TypeSpec, alloy-js, typespec-libraries) compounds.
**Mitigation:** Pin all transitive versions. Treat upgrades as discrete projects, not casual `pnpm up`.

### 3.4 CI quality

This is a strong point. CI verifies (per `package.json:38-43`):

- pnpm format check, lint, typecheck, build
- Vitest across all packages
- `pnpm run compile-examples` runs the full TypeSpec → output flow
- Generated Ent Go packages **actually compile** for both example projects (`go build ./...`)
- Generated SQLModel Python packages compile (`python -m compileall outputs/...`)
- Generated Zod TypeScript packages typecheck (`tsc`)
- Upstream Protobuf output exists for file-vault example

**This catches structural breakage end-to-end.** It doesn't catch semantic regressions (a wrongly-named index, a swapped enum value), but it's far above the typical 0.x library bar.

---

## 4. Openlet Schema Feasibility Matrix

Mapping `openlet.md` §4 tables to emitter coverage:

| Openlet table / field                                                      | Ent                                                      | SQLModel                 | Zod                     | Notes                                        |
| -------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------ | ----------------------- | -------------------------------------------- |
| `users(id, email, google_sub, ...)`                                        | ✅                                                       | ✅                       | 🔧 via `@data UserView` | Standard table                               |
| `service_accounts(id, name, owner_user_id, status, ...)`                   | ✅                                                       | ✅                       | 🔧 via `@data`          | Standard table                               |
| `sa_credentials(id, sa_id, secret_hash, ...)`                              | ✅                                                       | ✅                       | n/a (server-only)       | Standard table                               |
| `refresh_tokens(principal_type, principal_id, ...)`                        | ⚠️ no FK on principal_id                                 | ⚠️ no FK on principal_id | 🔧 via `@data`          | **Polymorphic** — drop FK, enforce in app    |
| `delegated_token_grants`                                                   | ✅                                                       | ✅                       | n/a                     | Standard table                               |
| `workspaces(owner_principal_type, owner_principal_id, ...)`                | ⚠️ no FK                                                 | ⚠️ no FK                 | 🔧 via `@data`          | **Polymorphic**                              |
| `workspace_members(workspace_id, principal_type, principal_id, role, ...)` | ⚠️ workspace_id FK ok if same service; principal FK lost | ⚠️ same                  | 🔧 via `@data`          | Cross-service + polymorphic                  |
| `folders(parent_folder_id, ...)` self-ref                                  | ⚠️ self-ref untested in lib                              | ⚠️ same                  | n/a                     | **Pilot self-reference before scaling**      |
| `files(workspace_id, folder_id, search_vector TSVECTOR, ...)`              | ❌ TSVECTOR + GIN need hand-stitch                       | ❌ same                  | 🔧 via `@data FileView` | **Hand-write FTS column + GIN in side-file** |
| `file_tags(file_id, tag)` PK both                                          | ✅ composite key supported                               | ✅ same                  | n/a                     | Composite-key m2m payload-free               |
| `leti_sessions(workspace_scope_ids JSONB)`                                 | ✅ `field.JSON` (untyped)                                | ✅ `Column(JSONB)`       | 🔧 via `@data`          | Untyped Go side                              |
| `leti_messages`                                                            | ✅                                                       | ✅                       | 🔧                      | Standard                                     |
| `leti_tool_calls(args JSONB, result JSONB, status check)`                  | ✅ JSONB + check supported                               | ✅ same                  | 🔧 via `@data`          | Args/result untyped on Go side               |
| `leti_policies(user_id, tool_name, default_mode)`                          | ✅ composite key                                         | ✅ same                  | n/a                     | Standard                                     |
| `notifications(user_id, kind, payload JSONB)`                              | ⚠️ user_id cross-service                                 | ⚠️ same                  | 🔧 via `@data`          | Cross-service FK lost                        |
| `@manyToMany("user_badges")` style joins                                   | ✅ shorthand                                             | ✅ shorthand             | n/a                     | Works; payload-free joins only               |
| Named `@check` constraints                                                 | ✅ `Checks: map`                                         | ✅ `CheckConstraint`     | ❌ no `.refine`         | DBML may drop                                |
| `@autoCreateTime`, `@autoUpdateTime`, `@softDelete`, `@version`            | ✅                                                       | ✅                       | n/a                     | All work via `@tableMixin`                   |

**Coverage summary:**

- Cleanly modeled: ~75%
- Workaround required (side-file, scalar-only, polymorphic with `@check`): ~20%
- Hand-stitched (TSVECTOR + GIN): ~5%

---

## 5. Recommendation

### 5.1 The decision matrix

**Adopt if:**

- You can vendor or fork the libraries within 6 months
- You accept polymorphic FKs lose referential integrity (enforced in app/check constraints)
- You accept TSVECTOR + GIN are hand-stitched in non-generated side-files
- You commit to Zod 4 in the Next.js frontend
- You define explicit `@data` view models for frontend types (not auto-shared from `@table`)
- Your services share one Postgres database (cross-service FK target tables auto-import to consumers)

**Don't adopt if:**

- You need each Go service to own its own Postgres database with strict cross-service isolation
- You can't budget engineering time to fork/maintain the emitters
- You need polymorphic FKs to be type-safe (no schema-generation tool gives you this — it's a Postgres limitation, not a library one)

### 5.2 Suggested phased adoption for Openlet

**Phase 0 — Pilot (1 week, before Phase 1 of MVP):**

1. Build `audit-svc` schema only (cleanest fit — no polymorphic FKs, no FTS, no cross-service refs).
2. Generate Ent + SQLModel + DBML + Zod views.
3. Run Atlas migration. Run a `go test`. Confirm output matches expectations.
4. Validate the workaround patterns for the three blockers feel acceptable.

**Phase 1 — Expand to file-service (week 4-5):**

1. Add file-service schema with TSVECTOR side-file pattern.
2. Confirm workspace polymorphic-owner pattern (`@check` + scalar columns) survives a code review.
3. If both feel forced, **stop and fall back to hand-written Ent**. The cost of generating ~75% schema then patching the rest may exceed the value if patching is fragile.

**Phase 2 — Vendor decision (week 6):**

1. Fork `qninhdt/typespec-libraries` into Openlet's org under `tools/typespec-libraries/`.
2. Pin all dependents to the fork.
3. Treat upstream as a reference, not a runtime dependency.

**Phase 3 — Fix the blockers in your fork (post-MVP, if Openlet keeps using it):**

1. Add `@goType("import.path/Type")` decorator to ORM core
2. Add `tsvector` first-class scalar branch in Ent emitter + GIN index annotation
3. Add `@polymorphic("type_col", "id_col")` decorator + emitter handling for Ent + SQLModel
4. Submit upstream PRs — but don't block on them being accepted

### 5.3 Alternatives considered

| Alternative                                          | Why not                                                                                                                     |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Hand-write Ent + SQLModel schemas separately         | Dual maintenance burden across 7 services; no single source of truth; contradicts Openlet's gRPC + shared-protobuf strategy |
| Use only Protobuf as the SoT, generate ORM elsewhere | Protobuf has no FK/index/check/relation primitives; loses what TypeSpec brings                                              |
| Use a different TypeSpec emitter ecosystem           | None exists with this coverage. TypeSpec's official emitters target OpenAPI/Protobuf, not ORM                               |
| Switch to Prisma / Drizzle / SQLBoiler               | Drops Ent (Openlet locked on Ent for Go services); contradicts §2 of openlet.md                                             |

---

## 6. Final Verdict

**Adopt with eyes open. Plan to fork.**

This is the cleanest TypeSpec-to-ORM stack reviewed. It will save Openlet engineering hours during Phase 1-3 of the MVP. The risk is institutional, not technical: a 0.x personal project becoming load-bearing in production. Mitigate by vendoring/forking within 6 months, pinning upstream versions, and accepting the three structural gaps (polymorphic FKs, TSVECTOR, cross-service edges) as workarounds rather than blockers.

For Openlet's 12-week MVP timeline, the saved hours from generated schema + DBML docs + Zod forms outweigh the maintenance overhead of the fork — _if_ the Phase 0 pilot validates that the workaround patterns are clean. If the pilot reveals constant patching, fall back to hand-written schemas and revisit when the library hits 1.0.

---

## 7. Unresolved Questions

1. **`@scope("frontend")` selector behavior in Zod emitter** — README documents it for ORM core but Zod emitter README doesn't clearly document it as an include axis. Needs spike to confirm before relying on it for cross-cutting frontend filtering.
2. **DBML named-`@check` rendering** — verify on a non-trivial schema (e.g., Openlet's `leti_tool_calls` with status check) before treating dbdocs as design-of-record.
3. **DBML `[delete: cascade]` on Refs** — emitter present but visual confirmation in sample output not done.
4. **Self-referencing FK behavior end-to-end** (folder.parent_folder_id) — no test coverage, no example. Pilot before scaling.
5. **One shared Postgres database vs per-service databases** — `openlet.md` doesn't lock this. SQLModel cross-service FK pattern requires shared DB to be real FKs. Affects file-worker → file-service references.
6. **Fork ownership** — who in Openlet's team would own the fork if upstream stalls? Decide before adopting at scale.
7. **Atlas migration story for hand-stitched columns** — can the TSVECTOR side-file mixin coexist with Atlas's "schema is the source of truth" model without drift on `atlas migrate diff`?
