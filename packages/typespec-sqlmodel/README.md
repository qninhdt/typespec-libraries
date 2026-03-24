# @qninhdt/typespec-sqlmodel

TypeSpec emitter that generates namespace-grouped SQLModel packages.

This emitter consumes `@qninhdt/typespec-orm` schemas and generates:

- SQLModel classes for `@table`
- Pydantic-style data models for `@data`
- package scaffolding for standalone distribution
- Alembic-friendly package metadata

## What This Emitter Is For

Use this emitter when you want TypeSpec to drive Python persistence models and form/data shapes with one shared schema contract.

It is designed for:

- namespace-derived Python package layouts
- explicit relation mapping
- strict persistence behavior
- easy migration setup through `metadata = SQLModel.metadata`

## Installation

```sh
pnpm add -D \
  @typespec/compiler \
  @typespec/emitter-framework \
  @alloy-js/core \
  @alloy-js/typescript \
  @qninhdt/typespec-orm \
  @qninhdt/typespec-sqlmodel
```

## Runtime Expectations

Generated Python output targets the SQLModel and SQLAlchemy ecosystem.

- standalone mode writes `pyproject.toml`
- package roots export `metadata = SQLModel.metadata`
- many-to-many shorthand generates `__associations__.py`
- collection persistence may rely on SQLAlchemy dialect-specific types depending on the configured strategy

The repo currently verifies generated output with Python `3.10+`.

## Configuration Reference

```yaml
emit:
  - "@qninhdt/typespec-sqlmodel"

options:
  "@qninhdt/typespec-sqlmodel":
    output-dir: "./outputs/sqlmodel"
    standalone: true
    library-name: "acme-models"
    collection-strategy: "jsonb"
    include:
      - "Demo.Platform"
    exclude:
      - "Demo.Platform.Audit"
```

Supported options:

| Option                | Type                    | Meaning                                           |
| --------------------- | ----------------------- | ------------------------------------------------- |
| `output-dir`          | `string`                | target directory handled by the TypeSpec compiler |
| `standalone`          | `boolean`               | write `pyproject.toml` and package scaffolding    |
| `library-name`        | `string`                | distribution name used in standalone mode         |
| `collection-strategy` | `"jsonb" \| "postgres"` | persistence strategy for list-like fields         |
| `include`             | `string[]`              | namespace or declaration selectors to keep        |
| `exclude`             | `string[]`              | namespace or declaration selectors to drop        |

Not supported:

- `module-name`
- emitter-specific folder aliases

## Selector Behavior

SQLModel generation uses the shared ORM selector engine. Selectors are dotted names, not glob patterns.

Examples:

```yaml
include:
  - "Demo.GamePlatform"
exclude:
  - "Demo.GamePlatform.Audit"
```

Behavior:

- `exclude` wins over `include`
- redundant selectors warn
- excluding a required dependency fails emission before any Python package is written

## Output Layout

Given:

```typescript
namespace App.Identity;
```

Standalone output looks like:

```text
outputs/sqlmodel/
  pyproject.toml
  app/
    __init__.py
    identity/
      __init__.py
      user.py
```

Rules:

- namespace segments become Python package directories
- `__init__.py` files are generated at every emitted package level
- top-level package roots expose `metadata = SQLModel.metadata`

That root-level `metadata` export is the intended Alembic integration point.

## Generated Package Contract

Standalone output typically includes:

- `pyproject.toml`
- namespace package folders with generated `__init__.py`
- one module per emitted model
- a top-level `__associations__.py` for shorthand many-to-many tables
- a root package export for `metadata = SQLModel.metadata`

Non-standalone mode emits only the code tree and skips package metadata files.

## Schema Example

```typescript
import "@qninhdt/typespec-orm";

using Qninhdt.Orm;

namespace Demo.Shared;

@tableMixin
model Timestamped {
  @key id: uuid;
  @autoCreateTime createdAt: utcDateTime;
  @autoUpdateTime updatedAt?: utcDateTime;
}

namespace Demo.Accounts;

@table
model User is Demo.Shared.Timestamped {
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
model Badge is Demo.Shared.Timestamped {
  @unique code: string;

  @manyToMany("user_badges")
  users?: User[];
}
```

## Generated Behavior

### Tables

`@table` models become SQLModel classes with:

- `__tablename__`
- SQLAlchemy column types when needed
- index and unique metadata
- composite constraint support
- foreign-key handling with delete/update actions

### Data models

`@data` models become non-table Python models that preserve:

- validation metadata
- titles and descriptions
- placeholder metadata in JSON schema extras

### Named checks

```typescript
@check("users_credits_non_negative", "credits >= 0")
credits: int32 = 0;
```

becomes:

```py
CheckConstraint("credits >= 0", name="users_credits_non_negative")
```

inside `__table_args__`.

### Many-to-many shorthand

When both sides declare:

```typescript
@manyToMany("user_badges")
```

the emitter generates:

- relationship fields using `secondary`
- a synthesized association table inside `__associations__.py`
- imports from that association module where needed

### Alembic helper

Top-level package roots expose:

```py
from sqlmodel import SQLModel

metadata = SQLModel.metadata
```

This makes it straightforward to wire the generated package into Alembic.

Example:

```py
from demo import metadata

target_metadata = metadata
```

### Collection persistence

`collection-strategy` controls array storage:

- `"jsonb"`: JSON-backed list persistence
- `"postgres"`: PostgreSQL `ARRAY(...)` where supported

Unsupported persistence shapes fail with diagnostics.

## Generated Relationship Model

What the emitter produces for common patterns:

- many-to-one and one-to-one relations become `Relationship(...)` pairs with explicit ownership driven by `@foreignKey`
- many-to-many shorthand becomes `secondary=...` relationships backed by generated association tables
- referenced-column foreign keys are preserved instead of assuming every relation points at `id`

When you need payload columns on the join itself, define an explicit junction table model instead of relying on shorthand.

## Supported Features

- namespace-first package layout
- standalone package generation with `pyproject.toml`
- `@tableMixin`
- referenced-column foreign keys
- named checks
- many-to-many shorthand
- collection persistence strategies
- `@data` model generation
- shared filtering with `include` and `exclude`

## Limitations

- many-to-many shorthand is for simple join tables without payload columns
- if a join table needs extra data, model it explicitly
- non-standalone mode emits code only and skips package metadata

## Common Diagnostics And Gotchas

- `standalone-requires-library-name`
  Standalone mode needs `library-name` to write a coherent Python distribution manifest.
- `unsupported-type`
  The TypeSpec field could not be mapped to a SQLModel or SQLAlchemy field.
- `missing-back-reference`
  A collection relation has no inverse owner. SQLAlchemy may require additional manual configuration if you keep the model shape as-is.
- `foreign-key-target-not-table`
  `@foreignKey` points at something that is not a `@table` model.

Practical guidance:

- keep generated packages importable on their own before wiring them into application code
- use the exported root `metadata` in Alembic instead of manually assembling model imports
- prefer explicit data models for public-facing API shapes rather than exposing persistence models directly

## Verification

The repo verifies generated Python output with:

```sh
pnpm run compile-examples
python -m compileall outputs/sqlmodel
```

## Related Docs

- [`README.md`](/home/qninh/projects/typespec-libraries/README.md)
- [`packages/typespec-orm/README.md`](/home/qninh/projects/typespec-libraries/packages/typespec-orm/README.md)

---

Made with heart by @qninhdt, with GPT-5.4 and Claude Opus 4.6.
