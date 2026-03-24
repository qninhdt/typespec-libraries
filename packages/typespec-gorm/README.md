# @qninhdt/typespec-gorm

TypeSpec emitter that generates namespace-grouped Go packages for GORM.

This emitter consumes `@qninhdt/typespec-orm` models and generates:

- GORM structs for `@table`
- DTO/form structs for `@data`
- standalone Go module metadata when requested

## What This Emitter Is For

Use this emitter when your source of truth is TypeSpec and you want generated Go models that:

- follow namespace structure
- preserve relation semantics
- preserve named checks and composite constraints
- validate generated Go as part of CI

## Installation

```sh
pnpm add -D \
  @typespec/compiler \
  @typespec/emitter-framework \
  @alloy-js/core \
  @alloy-js/typescript \
  @qninhdt/typespec-orm \
  @qninhdt/typespec-gorm
```

## Runtime Expectations

Generated Go code is aimed at modern GORM projects.

- standalone mode writes a `go.mod` rooted at the configured `library-name`
- generated models import `gorm.io/gorm`
- UUID fields use `github.com/google/uuid`
- decimal fields may pull in `github.com/shopspring/decimal`
- `jsonb` collection storage uses `gorm.io/datatypes`

The repo currently verifies generated output with Go `1.22`.

## Configuration Reference

```yaml
emit:
  - "@qninhdt/typespec-gorm"

options:
  "@qninhdt/typespec-gorm":
    output-dir: "./outputs/gorm"
    standalone: true
    library-name: "github.com/acme/domain-models"
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
| `standalone`          | `boolean`               | write `go.mod` and the root helper file           |
| `library-name`        | `string`                | Go module/import root used in standalone mode     |
| `collection-strategy` | `"jsonb" \| "postgres"` | persistence strategy for array-like fields        |
| `include`             | `string[]`              | namespace or declaration selectors to keep        |
| `exclude`             | `string[]`              | namespace or declaration selectors to drop        |

Not supported:

- `package-name`
- flat `models/` layout configuration

If you want `models` in the generated path, put `Models` in the namespace.

## Selector Behavior

GORM uses the shared ORM selector engine. Selectors are dotted names with prefix matching and no wildcard syntax.

Examples:

```yaml
include:
  - "Demo.GamePlatform"
exclude:
  - "Demo.GamePlatform.Audit"
  - "Demo.GamePlatform.Forms"
```

Behavior:

- `exclude` wins over `include`
- redundant selectors warn
- excluding a required relation target, enum, alias, or mixin fails emission before files are written

## Output Layout

Given:

```typescript
namespace App.Identity;
```

Standalone output looks like:

```text
outputs/gorm/
  go.mod
  models.go
  app/
    identity/
      user.go
```

Rules:

- namespace segments are converted with `camelToSnake`
- the final namespace segment becomes the Go package name
- the full namespace directory becomes the import path

Example import:

```go
import "github.com/acme/domain-models/app/identity"
```

### Root Helper File

In standalone mode the emitter also writes a root helper file, currently `models.go`, that:

- imports every emitted namespace package
- exposes `Init(db *gorm.DB) error`
- runs `db.AutoMigrate(...)` over the generated table models

That helper is intended as a convenience entrypoint for generated model packages. It is not a replacement for a full application migration strategy.

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

@table
model Subscription is Demo.Shared.Timestamped {
  userId: uuid;

  @foreignKey("userId")
  @onDelete("CASCADE")
  @onUpdate("CASCADE")
  user: User;
}
```

## Generated Behavior

### Tables

`@table` models become GORM structs with:

- `column:` tags
- type mapping from TypeSpec scalar to Go/GORM type
- `primaryKey`, `uniqueIndex`, `index`, `default`, and precision tags as needed
- `TableName()` methods

### Data models

`@data` models become plain Go structs with:

- `json` tags
- `validate` tags where applicable
- form metadata encoded into `form` tags from `@title` and `@placeholder`

### Checks

```typescript
@check("users_credits_non_negative", "credits >= 0")
credits: int32 = 0;
```

becomes a named `check:` tag in the emitted struct field metadata.

### Many-to-many shorthand

```typescript
@manyToMany("user_badges")
badges?: Badge[];
```

becomes:

- a relationship field
- `gorm:"many2many:user_badges"`

For GORM, shorthand join tables are inferred from relationship metadata rather than emitted as dedicated Go structs.

### Collections

`collection-strategy` controls array persistence:

- `"jsonb"`: emit `datatypes.JSONSlice[...]`
- `"postgres"`: emit native PostgreSQL array types where supported

Unsupported collection shapes fail with diagnostics.

## Generated Module Contract

What you should expect from standalone output:

- `go.mod` using `library-name` as the module path
- one Go package per namespace directory
- package names derived from the final namespace segment
- a root helper file for imports and `AutoMigrate`
- deterministic file names derived from model names

What you should expect from non-standalone output:

- code only
- no `go.mod`
- no surprise packaging metadata outside the generated code tree

## Supported Features

- namespace-first output
- standalone module generation with `go.mod`
- `@tableMixin`
- referenced-column foreign keys
- one-to-one, many-to-one, and one-to-many relations
- many-to-many shorthand
- named checks
- collection persistence strategies
- DTO/form generation from `@data`
- shared filtering with `include` and `exclude`

## Limitations

- many-to-many shorthand is intended for simple join tables only
- if the join needs payload columns, use an explicit junction model
- cross-package Go relationships can create import cycles depending on the schema; the example repo demonstrates a same-namespace many-to-many pattern for that reason

## Common Diagnostics And Gotchas

- `standalone-requires-library-name`
  Standalone mode cannot write a usable Go module without `library-name`.
- `unsupported-type`
  The source TypeSpec field could not be mapped to a Go type or GORM field representation.
- `missing-back-reference`
  A one-to-many relation has no inverse many-to-one. GORM may still compile, but automatic FK behavior can be incomplete.
- `unknown-format`
  The field format does not have a Go validation-tag equivalent and will be ignored.

Modeling guidance:

- keep many-to-many shorthand within a package when possible to avoid import-cycle pressure
- prefer explicit junction tables if the relationship needs payload fields or custom naming beyond a simple join
- use selectors to emit bounded contexts cleanly, but keep dependency closure intact

## Verification

The repo verifies generated Go output with:

```sh
pnpm run compile-examples
cd outputs/gorm
go build -mod=mod ./...
```

## Related Docs

- [`README.md`](/home/qninh/projects/typespec-libraries/README.md)
- [`packages/typespec-orm/README.md`](/home/qninh/projects/typespec-libraries/packages/typespec-orm/README.md)

---

Made with heart by @qninhdt, with GPT-5.4 and Claude Opus 4.6.
