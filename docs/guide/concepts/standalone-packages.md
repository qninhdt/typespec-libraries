# Standalone packages

By default, every emitter writes raw schema code into the namespace
folders you give it. With `standalone: true`, it goes one step further
and writes a publishable package — `go.mod`, `pyproject.toml`, or
`package.json` — that you can drop into a service repo or push to a
registry.

## When to use it

Use `standalone: true` when:

- The output is a _deliverable_. You want to publish it to a private
  npm registry, push it to a Go module proxy, or include it as a Python
  package distribution.
- You want one-stop reproducibility — `pnpm install`, `go mod tidy`, or
  `pip install -e .` should just work against the generated tree.

Skip it when:

- You're regenerating into an existing project (the project already has
  its own `go.mod` / `pyproject.toml` / `package.json`).
- You only need schema files alongside hand-written code.

## Required: `library-name`

`library-name` is the package identifier. It's required when
`standalone: true`. The exact form depends on the target:

| Emitter  | `library-name` example          |
| -------- | ------------------------------- |
| Ent      | `github.com/acme/domain-models` |
| SQLModel | `acme-models`                   |
| Zod      | `@acme/forms`                   |

Without it, the emitter raises `standalone-requires-library-name`.

## What gets written

### Ent

```
ent/
  schema/      # one file per @table or @tableMixin
  generate.go  # //go:generate go run -mod=mod entgo.io/ent/cmd/ent generate ./schema
go.mod         # uses library-name as the module path
README.md      # generated README
.gitignore
atlas.hcl      # if any tables are selected
```

Defaults: Go 1.24 (override with `go-version`),
`entgo.io/ent v0.14.6`, `google/uuid v1.6.0`,
`shopspring/decimal v1.4.0` for `decimal128`.

### SQLModel

```
<library_name>/                     # snake-cased
  __init__.py                       # exports target_metadata
  py.typed
  <namespace>/<model>.py            # one per table / mixin
  __associations__.py               # m2m join tables
pyproject.toml                      # hatchling build, sqlmodel + sqlalchemy + pydantic
README.md
LICENSE
```

Optional: `emit-atlas: true` writes an `atlas.hcl` that uses the
`atlas-provider-sqlalchemy` external schema. Off by default.

### Zod

```
src/
  <namespace>/<Model>.ts            # one per default form model
  index.ts                          # root barrel
package.json                        # ESM, depends on zod
tsconfig.json
```

The barrel re-exports every model schema and inferred type so
consumers can `import { UserSchema, type User } from "@acme/forms"`.

## Versioning

`version` (Ent / SQLModel / Zod) sets the version surfaced in the
generated package metadata. It's not consumed at runtime — your CI is
free to overwrite it before publishing.

```yaml
"@qninhdt/typespec-zod":
  standalone: true
  library-name: "@acme/forms"
  version: "0.1.0"
  description: "Frontend form validation schemas"
  license: "UNLICENSED"
```

## Description and license

Optional metadata that ends up in the package file:

- `description` — surfaces in `package.json` (Zod) and `pyproject.toml`
  (SQLModel).
- `license` — `package.json` license string (Zod) or the `LICENSE` file
  body (SQLModel). Default is "UNLICENSED" for Zod and "Proprietary —
  internal use only" for SQLModel.

## Migration helpers

Standalone Ent + Atlas is the canonical PostgreSQL migration story for
this library. Combine with `collection-strategy: "jsonb"` and you have:

- typed schema in Go
- migrations driven by Atlas reading the same schema
- DBML output as a review surface

For Python, set `standalone: true` and `emit-atlas: true` to get the
same Atlas pipeline reading SQLAlchemy.

Next: how to attach UI metadata in [Form metadata](/guide/form-metadata).
