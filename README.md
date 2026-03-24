# TypeSpec Libraries

TypeSpec ORM and schema-generation tooling for teams that want one namespace-first source of truth and multiple generated targets.

This repository contains:

- `@qninhdt/typespec-orm`: shared decorators, relation resolution, validation, normalization, and selector filtering
- `@qninhdt/typespec-gorm`: Go + GORM emitter for `@table` and `@data`
- `@qninhdt/typespec-sqlmodel`: Python + SQLModel emitter for `@table` and `@data`
- `@qninhdt/typespec-zod`: Zod emitter for `@data`
- `@qninhdt/typespec-dbml`: DBML emitter for `@table`

## Why This Repo Exists

The goal of this repo is not just code generation. It is to make a TypeSpec schema behave like a real domain-model contract:

- namespaces define output structure
- relations are validated once in shared ORM logic
- emitters fail loudly on unsupported persistence shapes
- filtered generation is dependency-aware
- examples are checked in and verified in CI

That means the same TypeSpec model can drive Go services, Python services, frontend form validation, and DBML documentation without every emitter inventing its own interpretation.

## Current Design Principles

### Namespace-first

Namespaces are mandatory for ORM-managed declarations. They are not decorative. They control:

- output folder layout
- package structure
- selection filters
- import paths
- namespace-split DBML output

If a team wants a folder like `models`, the namespace must include `Models`.

### Shared ORM Core

All emitters consume the normalized ORM graph built by `@qninhdt/typespec-orm`. That graph resolves:

- tables
- data models
- mixins
- namespace segments and output paths
- relation ownership
- referenced-column foreign keys
- filter selection and dependency validation
- many-to-many shorthand associations

### Strictness Over Silent Fallbacks

Unsupported persistence mappings, invalid relation shapes, conflicting selectors, missing namespaces, and filtered dependencies are treated as diagnostics. The repository prefers explicit failure over degraded output.

## Repository Layout

```text
packages/
  typespec-orm/
  typespec-gorm/
  typespec-sqlmodel/
  typespec-zod/
  typespec-dbml/
examples/
outputs/
docs/
```

Important directories:

- `examples/`: end-to-end schema used as the canonical example
- `outputs/`: checked-in generated artifacts
- `docs/feature-proposal.md`: phased roadmap and design notes

## Package Roles

| Package                      | Input                                  | Output                       | Primary Responsibility                                             |
| ---------------------------- | -------------------------------------- | ---------------------------- | ------------------------------------------------------------------ |
| `@qninhdt/typespec-orm`      | TypeSpec decorators and compiler state | none                         | Validation, normalization, relation resolution, selector filtering |
| `@qninhdt/typespec-gorm`     | normalized ORM graph                   | Go packages for GORM         | Persisted models and DTOs for Go services                          |
| `@qninhdt/typespec-sqlmodel` | normalized ORM graph                   | Python packages for SQLModel | Persisted models and DTOs for Python services                      |
| `@qninhdt/typespec-zod`      | normalized ORM graph                   | Zod schemas + inferred types | Frontend and API validation for `@data` models                     |
| `@qninhdt/typespec-dbml`     | normalized ORM graph                   | DBML files                   | Database review and architecture documentation                     |

## Installation

Install only the packages you need, but most users start with the ORM core plus one or more emitters:

```sh
pnpm add -D \
  @typespec/compiler \
  @qninhdt/typespec-orm \
  @qninhdt/typespec-gorm \
  @qninhdt/typespec-sqlmodel \
  @qninhdt/typespec-zod \
  @qninhdt/typespec-dbml
```

Emitter peer dependencies are documented in each package README.

## Runtime Expectations By Target

The generator packages are TypeSpec build-time dependencies. The generated outputs have their own runtime expectations:

| Target   | Typical runtime dependencies                                                                                 | Notes                                                                   |
| -------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| GORM     | `gorm.io/gorm`, `github.com/google/uuid`, optionally `gorm.io/datatypes` and `github.com/shopspring/decimal` | standalone mode writes `go.mod`; non-standalone mode emits code only    |
| SQLModel | `sqlmodel`, SQLAlchemy, Pydantic-compatible typing support                                                   | standalone mode writes `pyproject.toml` and package roots               |
| Zod      | `zod`, TypeScript for package builds                                                                         | standalone mode writes `package.json`, `tsconfig.json`, and root barrel |
| DBML     | none                                                                                                         | DBML is documentation output, not runtime code                          |

## End-to-End Example

### Schema

```typescript
import "@qninhdt/typespec-orm";

using Qninhdt.Orm;

namespace Demo.Platform.Shared;

@tableMixin
model Timestamped {
  @key id: uuid;
  @autoCreateTime createdAt: utcDateTime;
  @autoUpdateTime updatedAt?: utcDateTime;
}

namespace Demo.Platform.Accounts;

@table
model User is Demo.Platform.Shared.Timestamped {
  @unique
  @maxLength(320)
  @format("email")
  email: string;

  @check("users_credits_non_negative", "credits >= 0")
  credits: int32 = 0;

  @manyToMany("user_badges")
  badges?: Badge[];
}

@table
model Badge is Demo.Platform.Shared.Timestamped {
  @unique
  @maxLength(80)
  code: string;

  @manyToMany("user_badges")
  users?: User[];
}

namespace Demo.Platform.Forms;

@data("Create Invitation Form")
model CreateInvitationForm {
  @title("Invitee Email")
  @placeholder("friend@example.com")
  inviteeEmail: Demo.Platform.Accounts.User.email;
}
```

### Compiler Configuration

```yaml
emit:
  - "@qninhdt/typespec-gorm"
  - "@qninhdt/typespec-sqlmodel"
  - "@qninhdt/typespec-zod"
  - "@qninhdt/typespec-dbml"

options:
  "@qninhdt/typespec-gorm":
    output-dir: "./outputs/gorm"
    standalone: true
    library-name: "github.com/acme/domain-models"
    collection-strategy: "jsonb"

  "@qninhdt/typespec-sqlmodel":
    output-dir: "./outputs/sqlmodel"
    standalone: true
    library-name: "acme-models"
    collection-strategy: "jsonb"

  "@qninhdt/typespec-zod":
    output-dir: "./outputs/zod"
    standalone: true
    library-name: "@acme/forms"

  "@qninhdt/typespec-dbml":
    output-dir: "./outputs/dbml"
    split-by-namespace: true
```

### Compile

```sh
tsp compile .
```

## Shared Concepts Across Packages

### `@table`, `@data`, and `@tableMixin`

- `@table` models participate in persistence emitters
- `@data` models participate in form/DTO emitters
- `@tableMixin` models are reusable ORM fragments that are validated but never emitted as standalone tables

### Referenced-column foreign keys

You can point a relation at something other than `id`:

```typescript
@table
model Organization {
  @key
  @unique
  code: string;
}

@table
model User {
  organizationCode: string;

  @foreignKey("organizationCode", "code")
  organization: Organization;
}
```

### Named checks

```typescript
@check("users_credits_non_negative", "credits >= 0")
credits: int32 = 0;
```

### Many-to-many shorthand

```typescript
@manyToMany("user_badges")
badges?: Badge[];
```

Both sides must opt in with the same join table name.

### Shared selectors

Every emitter supports the same selector model:

```yaml
include:
  - "Demo.Platform.Forms"
exclude:
  - "Demo.Platform.Audit"
```

Selectors can target:

- a namespace subtree such as `Demo.Platform.Forms`
- a concrete declaration such as `Demo.Platform.Worlds.World`

Behavior:

- `exclude` wins over `include`
- redundant selectors warn
- selecting a model while excluding a required dependency is an error

### Selector Reference

Selectors are plain dotted declaration names. There is no wildcard syntax.

| Selector                               | Meaning                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------- |
| `Demo.GamePlatform`                    | everything under that namespace subtree                                   |
| `Demo.GamePlatform.Forms`              | only the forms subtree                                                    |
| `Demo.GamePlatform.Worlds.World`       | one concrete declaration plus anything nested below it                    |
| `Demo.GamePlatform.Audit` in `exclude` | removes the audit subtree even if a broader parent namespace was included |

Practical guidance:

- use namespace selectors for bounded-context level output
- use concrete declaration selectors sparingly, usually for targeted tests or partial package generation
- if a selected model depends on an excluded enum, alias, mixin, or relation target, emission fails before files are written

## Output Philosophy

### GORM

- namespace directories become Go package directories
- standalone mode emits `go.mod` and a root `models.go`
- `@manyToMany(...)` becomes GORM relationship tags
- `@check(...)` becomes named check tags

### SQLModel

- namespace directories become Python packages
- standalone mode emits `pyproject.toml`
- package roots expose `metadata = SQLModel.metadata`
- many-to-many shorthand generates `__associations__.py`

### Zod

- only `@data` models are emitted
- standalone mode emits `src/...` plus a root `index.ts`
- schemas, inferred types, and form metadata are emitted in a single render pass

### DBML

- can emit one file or split by namespace
- preserves FK actions, lookup-derived columns, enum indexes, and many-to-many join tables

## Feature Matrix

| Feature                                | ORM Core | GORM                | SQLModel            | Zod             | DBML               |
| -------------------------------------- | -------- | ------------------- | ------------------- | --------------- | ------------------ |
| Namespace-first output                 | yes      | yes                 | yes                 | yes             | yes                |
| Shared `include` / `exclude` selectors | yes      | yes                 | yes                 | yes             | yes                |
| `@tableMixin`                          | yes      | yes                 | yes                 | n/a             | yes                |
| Referenced-column foreign keys         | yes      | yes                 | yes                 | n/a             | yes                |
| Collection persistence strategies      | yes      | `jsonb`, `postgres` | `jsonb`, `postgres` | n/a             | array rendering    |
| Named `@check(...)` constraints        | yes      | yes                 | yes                 | n/a             | preserved as notes |
| `@manyToMany(...)` shorthand           | yes      | yes                 | yes                 | n/a             | yes                |
| Form metadata                          | yes      | form tags           | Pydantic metadata   | `*Meta` exports | n/a                |
| Alembic helper                         | n/a      | n/a                 | yes                 | n/a             | n/a                |
| Namespace-split DBML                   | n/a      | n/a                 | n/a                 | n/a             | yes                |

## Example Project In This Repo

The checked-in example under [`examples/`](examples/) is deliberately more than a toy schema. It demonstrates:

- nested namespaces across several bounded contexts
- reusable mixins
- lookup types across namespaces
- named checks
- many-to-many shorthand
- collection persistence
- Zod metadata
- namespace-split DBML generation

Useful commands:

```sh
pnpm run compile-examples
pnpm run verify-generated
```

Generated outputs are checked into:

- [`outputs/gorm`](outputs/gorm)
- [`outputs/sqlmodel`](outputs/sqlmodel)
- [`outputs/zod`](outputs/zod)
- [`outputs/dbml`](outputs/dbml)

## Migration Notes

If you are coming from the pre-namespace versions of this repo, the main behavior changes are intentional hard breaks:

- namespaces are now required for ORM-managed declarations
- emitters no longer invent a flat `models/` folder
- `library-name` replaced older emitter-specific package or module metadata options
- Zod no longer supports a custom `filename`; output is namespace-derived per model plus a root barrel
- filtering is shared across emitters and validated against dependencies instead of being loosely best-effort

The migration path is usually straightforward:

1. move root-level models into explicit namespaces
2. rename legacy emitter options to `library-name`
3. update imports to use namespace-derived paths
4. turn shared persisted base models into `@tableMixin` where appropriate
5. regenerate outputs and fix downstream package imports

## Development Workflow

Common commands:

```sh
pnpm install
pnpm run build
pnpm run test
pnpm run typecheck
pnpm run lint
pnpm run format:check
pnpm run compile-examples
pnpm run verify-generated
```

CI verifies:

- build
- typecheck
- lint
- formatting
- unit tests
- example compilation
- generated artifact drift
- `go build` for generated GORM output
- `python -m compileall` for generated SQLModel output
- `tsc -p tsconfig.json` for generated Zod output

## Package Documentation

- [`packages/typespec-orm/README.md`](packages/typespec-orm/README.md)
- [`packages/typespec-gorm/README.md`](packages/typespec-gorm/README.md)
- [`packages/typespec-sqlmodel/README.md`](packages/typespec-sqlmodel/README.md)
- [`packages/typespec-zod/README.md`](packages/typespec-zod/README.md)
- [`packages/typespec-dbml/README.md`](packages/typespec-dbml/README.md)

## Troubleshooting

Common errors and what they usually mean:

- `namespace-required`
  The model, mixin, or required dependency is declared at the global namespace. Move it under a real namespace.
- `filtered-dependency`
  Your `include` and `exclude` selectors selected a model but removed something it depends on. Expand the include set or stop excluding that dependency.
- `mixin-field-conflict`
  Two mixins, or a mixin plus the child model, define the same field name. Rename the field or model the overlap explicitly instead of relying on override behavior.
- `many-to-many-conflicting-explicit-table`
  A shorthand join table name collides with an explicit table model. Keep one approach only.
- `standalone-requires-library-name`
  The emitter is configured to write package metadata, but you did not provide the package/module name via `library-name`.

## Known Boundaries

- namespaces are required for ORM-managed declarations
- root-level emitted models are unsupported
- many-to-many shorthand is intended for simple join tables without payload columns
- if a join table needs extra payload columns, use an explicit junction model
- if you want a folder like `models`, put that in the namespace rather than expecting an emitter option

---

Made with heart by @qninhdt, with GPT-5.4 and Claude Opus 4.6.
