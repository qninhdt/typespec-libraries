# Migration guide

This guide is for users coming from a pre-namespace version of these
libraries — back when the emitters wrote a flat `models/` folder and
GORM was a supported direction.

## What changed

- **Namespaces are mandatory.** Every ORM-managed declaration must live
  inside a namespace. `namespace-required` is now an error.
- **Output is namespace-derived.** Emitters no longer invent a flat
  `models/` folder.
- **`library-name` replaced per-emitter package metadata options.**
  One canonical option for the standalone package identifier.
- **Zod doesn't take `filename` anymore.** Output is namespace-derived
  per model plus a root barrel.
- **Persistence emitters are PostgreSQL-only.** MySQL and SQLite
  options are gone.
- **GORM and the local protobuf emitter are removed.** Use upstream
  `@typespec/protobuf` with explicit `@field(number)`.
- **Filtering is shared and dependency-checked** across all emitters
  via `include` / `exclude` (see [Selectors](/guide/concepts/selectors)).
- **Emitters fail unsupported types** instead of emitting degraded
  fallbacks.

## Step-by-step

### 1. Move root-level models into namespaces

Wrap your `.tsp` files with explicit namespaces. The first segment
becomes the top-level package root in each emitter.

```diff
- @table
- model User { @key id: uuid; }

+ namespace Acme.Identity;
+
+ @table
+ model User { @key id: uuid; }
```

### 2. Rename emitter options

In `tspconfig.yaml`:

```diff
  "@qninhdt/typespec-ent":
-   package-name: "github.com/acme/models"
+   library-name: "github.com/acme/models"
+   standalone: true
```

```diff
  "@qninhdt/typespec-sqlmodel":
-   module-name: "acme_models"
+   library-name: "acme-models"
+   standalone: true
```

```diff
  "@qninhdt/typespec-zod":
-   filename: "schemas.ts"
+   standalone: true
+   library-name: "@acme/forms"
```

### 3. Update downstream import paths

Generated paths now follow your namespace. If your old generator wrote
`outputs/models/user.go` and your service imported it as
`github.com/acme/models/models`, the new path is namespace-derived:

```diff
- import "github.com/acme/models/models"
+ import "github.com/acme/models/identity"
```

### 4. Convert shared base models to `@tableMixin`

If you had a `Timestamped` model that everything embedded but you didn't
want it to be a table on its own, mark it as a mixin:

```diff
- @table
+ @tableMixin
  model Timestamped {
    @key id: uuid;
    @autoCreateTime createdAt: utcDateTime;
  }
```

### 5. Replace local protobuf with upstream

```diff
- import "@qninhdt/typespec-protobuf";
+ import "@typespec/protobuf";
```

Add explicit `@field(number)` on every message field — upstream
Protobuf doesn't auto-number. See the file-vault example for the
canonical pattern.

### 6. Re-run emitters

```sh
pnpm install
npx tsp compile .
```

Fix diagnostics one at a time. The most common ones during migration:

- `namespace-required` — global declarations.
- `mixin-cycle` — circular `@tableMixin` spreads.
- `mixin-field-conflict` — overlapping fields between mixins.
- `filtered-dependency` — service config doesn't include a needed mixin.
  Set `auto-include-dependencies: true` to pull them in.

### 7. Audit FK shape

Referenced-column FKs are now explicit:

```diff
- @foreignKey owner: User;
+ owner: User;
+ ownerId: uuid;
+ @foreignKey("ownerId")
+ owner: User;
```

Ent doesn't support referenced-column FKs — it requires the FK to point
at the target's `@key`. SQLModel and DBML accept arbitrary `@unique`
columns.

## Atlas integration

If you used `entc.gen()` for migrations, switch to Atlas:

- Ent — `atlas.hcl` is generated when `standalone: true` and any tables
  are selected. No additional flag.
- SQLModel — set `emit-atlas: true` on the emitter to get an
  `atlas.hcl` using `atlas-provider-sqlalchemy`.

## ON UPDATE on Ent

Ent doesn't natively support ON UPDATE. By default `@onUpdate(...)` is
dropped with a warning. To preserve it as a SQL annotation comment for
review:

```yaml
"@qninhdt/typespec-ent":
  on-update-emit-raw-sql: true
```

## Where to go from here

- [Quickstart](/guide/quickstart) — fresh-start path with the new
  conventions.
- [Selectors](/guide/concepts/selectors) — how dependency closure works.
- [Diagnostics](/reference/diagnostics) — every code, with cause and fix.
