# @qninhdt/typespec-ent

TypeSpec emitter that generates PostgreSQL-oriented Ent schemas and Go DTO structs.

This emitter consumes `@qninhdt/typespec-orm` models and generates:

- Ent schema files for `@table` and `@tableMixin`
- DTO/form structs for default form models
- `atlas.hcl` for Atlas migration workflows
- standalone Go module metadata and `go generate` wiring when requested

## What This Emitter Is For

Use this emitter when your source of truth is TypeSpec and you want generated Go models that:

- keep persisted schemas in the standard `ent/schema` package
- preserve relation semantics
- preserve named checks and composite constraints
- validate generated Go as part of CI

## Installation

`sh
pnpm add -D \
  @typespec/compiler \
  @typespec/emitter-framework \
  @alloy-js/core \
  @alloy-js/typescript \
  @qninhdt/typespec-orm \
  @qninhdt/typespec-ent
`

## Runtime Expectations

Generated Go code is aimed at modern Ent projects.

- standalone mode writes a `go.mod` rooted at the configured `library-name`
- generated schemas import `entgo.io/ent`
- UUID fields use `github.com/google/uuid`
- decimal fields may pull in `github.com/shopspring/decimal`
- data-model `jsonb` fields use `encoding/json`
- every table selection writes a PostgreSQL Atlas `atlas.hcl` using `ent://ent/schema`

The repo currently verifies generated output with Go `1.24`.

## Configuration Reference

`yaml
emit:

- "@qninhdt/typespec-ent"

options:
"@qninhdt/typespec-ent":
output-dir: "./outputs/ent"
standalone: true
library-name: "github.com/acme/domain-models"
collection-strategy: "jsonb"
include: - "Demo.Platform"
exclude: - "Demo.Platform.Audit"
`

Supported options:

| Option                      | Type                    | Meaning                                                                                                                                       |
| --------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `output-dir`                | `string`                | target directory handled by the TypeSpec compiler                                                                                             |
| `standalone`                | `boolean`               | write `go.mod` and `ent/generate.go`                                                                                                          |
| `library-name`              | `string`                | Go module/import root used in standalone mode                                                                                                 |
| `version`                   | `string`                | library version surfaced in the generated standalone README                                                                                   |
| `collection-strategy`       | `"jsonb" \| "postgres"` | persistence strategy for array-like fields                                                                                                    |
| `include`                   | `string[]`              | namespace or declaration selectors to keep                                                                                                    |
| `exclude`                   | `string[]`              | namespace or declaration selectors to drop                                                                                                    |
| `auto-include-dependencies` | `boolean`               | transitively pull required dependencies (relations, mixins, enums) in                                                                         |
| `go-version`                | `string`                | Go toolchain version written into the generated `go.mod` (default `1.24`)                                                                     |
| `on-update-emit-raw-sql`    | `boolean`               | when `true`, surface `@onUpdate` as a `Comment("on_update: <action>")` Ent annotation instead of dropping it with a warning (default `false`) |

Not supported:

- `package-name`
- flat `models/` layout configuration

If you want `models` in the generated path, put `Models` in the namespace.

## Selector Behavior

Ent uses the shared ORM selector engine. Selectors are dotted names with prefix matching and no wildcard syntax.

Examples:

`yaml
include:

- "Demo.GamePlatform"
  exclude:
- "Demo.GamePlatform.Audit"
- "Demo.GamePlatform.Forms"
  `

Behavior:

- `exclude` wins over `include`
- redundant selectors warn
- excluding a required relation target, enum, alias, or mixin fails emission before files are written

## Output Layout

Given:

`typescript
namespace App.Identity;
`

Standalone output looks like:

`text
outputs/ent/
  atlas.hcl
  go.mod
  ent/
    generate.go
    schema/
      user.go
  app/
    identity/
      create_user_form.go
`

Rules:

- `@table` and `@tableMixin` always emit into `ent/schema`
- `@data` and unmarked data models keep namespace-derived Go packages
- standalone mode writes `ent/generate.go` with `go generate ./ent`
- `atlas.hcl` uses PostgreSQL dev database defaults

## Schema Example

`typescript
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
model User {
...Demo.Shared.Timestamped;
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
model Badge {
...Demo.Shared.Timestamped;
@unique code: string;

@manyToMany("user_badges")
users?: User[];
}

@table
model Subscription {
...Demo.Shared.Timestamped;
userId: uuid;

@foreignKey("userId")
@onDelete("CASCADE")
@onUpdate("CASCADE")
user: User;
}
`

## Generated Behavior

### Tables

`@table` models become Ent structs with:

- `ent.Schema`
- `Fields() []ent.Field`
- `Edges() []ent.Edge` for relations
- `Indexes() []ent.Index` for standalone and composite indexes
- `Annotations() []entschema.Annotation` for table names and checks

`@tableMixin` models become Ent mixins using `mixin.Schema`.

### Data models

default form models become plain Go structs with:

- `json` tags
- `validate` tags where applicable
- form metadata encoded into `form` tags from `@title` and `@placeholder`

### Checks

`typescript
@check("users_credits_non_negative", "credits >= 0")
credits: int32 = 0;
`

becomes a named check in the emitted Ent table annotation.

### Many-to-many shorthand

`typescript
@manyToMany("user_badges")
badges?: Badge[];
`

becomes:

- a relationship field
- `edge.To(...).StorageKey(edge.Table("user_badges"))`

For Ent, shorthand join tables are inferred from relationship metadata rather than emitted as dedicated Go structs.

### Collections

`collection-strategy` controls array persistence:

- `"jsonb"`: emit `field.JSON(...)`
- `"postgres"`: emit native PostgreSQL array types where supported

Unsupported collection shapes fail with error diagnostics.

## Generated Module Contract

What you should expect from standalone output:

- `go.mod` using `library-name` as the module path
- Ent schemas under `ent/schema`
- DTO structs under namespace-derived package directories
- `atlas.hcl` for Atlas
- `ent/generate.go` for Ent codegen
- deterministic file names derived from model names

What you should expect from non-standalone output:

- Ent schemas and DTO code
- `atlas.hcl` when tables are selected
- no `go.mod`

## Supported Features

- namespace-first output
- standalone module generation with `go.mod`
- `@tableMixin`
- referenced-column foreign keys
- one-to-one, many-to-one, and one-to-many relations
- many-to-many shorthand
- named checks
- collection persistence strategies
- DTO/form generation from default form models
- shared filtering with `include` and `exclude`

## Limitations

- many-to-many shorthand is intended for simple join tables only
- if the join needs payload columns, use an explicit junction model
- cross-package Go relationships can create import cycles depending on the schema; the example repo demonstrates a same-namespace many-to-many pattern for that reason

## Common Diagnostics And Gotchas

- `standalone-requires-library-name`
  Standalone mode cannot write a usable Go module without `library-name`.
- `unsupported-type`
  The source TypeSpec field could not be mapped to a Go type or Ent field representation and emission fails.
- `missing-back-reference`
  A one-to-many relation has no inverse many-to-one. Ent may still compile, but automatic FK behavior can be incomplete.
- `unknown-format`
  The field format does not have a Go validation-tag equivalent and will be ignored.

Modeling guidance:

- keep many-to-many shorthand within a package when possible to avoid import-cycle pressure
- prefer explicit junction tables if the relationship needs payload fields or custom naming beyond a simple join
- use selectors to emit bounded contexts cleanly, but keep dependency closure intact

## Verification

The repo verifies generated Go output with:

`sh
pnpm run compile-examples
cd outputs/ent
go build -mod=mod ./outputs/file-vault/ent/... && go build -mod=mod ./outputs/game-platform/ent/...
`

## Related Docs

- [`README.md`](/home/qninh/projects/typespec-libraries/README.md)
- [`packages/typespec-orm/README.md`](/home/qninh/projects/typespec-libraries/packages/typespec-orm/README.md)

---

Made with heart by @qninhdt, with GPT-5.4 and Claude Opus 4.6.
