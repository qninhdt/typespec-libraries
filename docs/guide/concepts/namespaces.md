# Namespaces

A TypeSpec namespace is the **organizing unit** of every emitter in this
library. It decides where files go, what package they belong to, and
which selectors match them.

## Required, not decorative

Every ORM-managed declaration — `@table`, `@tableMixin`, default form
models — must live inside a namespace. Models declared at the global
namespace produce a `namespace-required` diagnostic.

```typespec
// ❌ Error: namespace-required
@table
model User {
  @key id: uuid;
}

// ✅ OK
namespace Demo.Platform.Accounts;

@table
model User {
  @key id: uuid;
}
```

## Path normalization

A dotted namespace path becomes a snake-cased filesystem path
deterministically:

| Namespace                          | Output path                         |
| ---------------------------------- | ----------------------------------- |
| `Demo.Platform.Accounts`           | `demo/platform/accounts`            |
| `Demo.GamePlatform.Content.Worlds` | `demo/game_platform/content/worlds` |
| `FileVault.Storage`                | `file_vault/storage`                |

Rules:

- PascalCase / camelCase segments become snake_case (`GamePlatform` → `game_platform`).
- Underscores are preserved (`File_Vault` would error in PG; the
  identifier policy normalizes this).
- The emitter never invents a flat `models/` folder.

If you want a folder named `models`, put it in the namespace:

```typespec
namespace Demo.Platform.Accounts.Models;
```

## What namespaces drive

A namespace decides every one of these in lockstep:

| Aspect                          | Derived from        |
| ------------------------------- | ------------------- |
| Output folder per model         | namespace path      |
| Go package path                 | namespace path      |
| Python package path             | namespace path      |
| TypeScript module / barrel path | namespace path      |
| DBML namespace group / split    | namespace path      |
| `include` / `exclude` matching  | namespace full name |
| `@schema` / `@owner` walking    | namespace ancestry  |

That uniformity is what makes selectors portable across emitters: one
service's `include: ["FileVault.Storage"]` produces the same result in
the Ent, SQLModel, and DBML outputs.

## Top-level namespaces are package roots

The first segment of a namespace becomes a **top-level package root**:

- `Demo.Platform.Accounts` → top-level `demo`.
- `FileVault.Storage` → top-level `file_vault`.

Standalone mode emits one `go.mod` / `pyproject.toml` / `package.json`
per top-level. Cross-top-level relations work but cross-top-level
many-to-many associations are not supported (`cross-namespace-many-to-many-unsupported`
in SQLModel, `cross-package-edge` in Ent).

## Namespace decorators that walk

Some decorators apply to a model _or_ to one of its ancestor namespaces.
Emitters walk up the namespace chain to find them:

- `@schema("public")` — PostgreSQL schema scope.
- `@owner("identity-team")` — catalog ownership; surfaces in headers.

```typespec
@schema("billing")
namespace Demo.Platform.Billing;

@table
model Invoice {} // → schema "billing"
```

## Deduplication

`Demo.Platform.Accounts` and `Demo.Platform.Accounts.Profile` share
package leaves. The emitters deduplicate so you don't get
`accounts/accounts/` paths. The orm core's normalization step handles
this — you don't configure it.

Next: how to model real tables in
[Tables and mixins](/guide/concepts/tables-and-mixins).
