# @qninhdt/typespec-dbml

TypeSpec emitter that generates DBML from `@qninhdt/typespec-orm` table models.

This emitter is meant for schema review, architecture visualization, and keeping DBML aligned with the same TypeSpec schema used by the runtime emitters.

## When To Use This Emitter

DBML output is the right fit when you want:

- architecture review artifacts that stay close to the source schema
- a shareable representation for product, platform, or database discussions
- a single place to inspect table names, foreign keys, checks, and enum usage
- namespace-grouped documentation that mirrors the same domain boundaries used by code emitters

## What This Emitter Is For

Use this emitter when you want DBML that stays in sync with:

- namespace-aware table organization
- the same relation semantics used by GORM and SQLModel
- lookup-type columns
- FK delete/update actions
- synthesized many-to-many join tables

## Installation

```sh
pnpm add -D \
  @typespec/compiler \
  @typespec/emitter-framework \
  @alloy-js/core \
  @alloy-js/typescript \
  @qninhdt/typespec-orm \
  @qninhdt/typespec-dbml
```

## Configuration Reference

```yaml
emit:
  - "@qninhdt/typespec-dbml"

options:
  "@qninhdt/typespec-dbml":
    output-dir: "./outputs/dbml"
    filename: "schema"
    split-by-namespace: true
    include:
      - "Demo.Platform"
    exclude:
      - "Demo.Platform.Audit"
```

Supported options:

| Option               | Type       | Meaning                                            |
| -------------------- | ---------- | -------------------------------------------------- |
| `output-dir`         | `string`   | target directory handled by the TypeSpec compiler  |
| `filename`           | `string`   | single-file output name without the `.dbml` suffix |
| `split-by-namespace` | `boolean`  | emit one DBML file per namespace group             |
| `include`            | `string[]` | namespace or declaration selectors to keep         |
| `exclude`            | `string[]` | namespace or declaration selectors to drop         |

Notes:

- `filename` applies to single-file mode only
- in split mode, the final namespace segment becomes the file name
- filtering uses the same shared dependency rules as the code emitters

## Selector Behavior

DBML uses the same selector engine as the ORM-backed emitters.

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
- excluding a table dependency required by a selected table fails emission

## Output Modes

### Single-file mode

```text
outputs/dbml/schema.dbml
```

The emitter groups content by namespace sections inside the single file.

### Namespace-split mode

```text
outputs/dbml/demo/game_platform/accounts.dbml
outputs/dbml/demo/game_platform/worlds.dbml
```

In split mode:

- namespace path controls folders
- the final namespace segment becomes the DBML filename

## Emission Contract

Single-file mode is useful when you want one handoff artifact for a whole bounded system.

Split mode is useful when you want documentation files to mirror namespace ownership, for example:

- `demo/game_platform/accounts.dbml`
- `demo/game_platform/worlds.dbml`
- `demo/game_platform/audit.dbml`

In either mode the emitter is deterministic:

- namespace grouping is stable
- relations are generated from the same normalized graph used by the runtime emitters
- lookup-derived field types resolve to the source property's scalar type
- many-to-many shorthand synthesizes a join table automatically

## Schema Example

```typescript
import "@qninhdt/typespec-orm";

using Qninhdt.Orm;

namespace Demo.Accounts;

@table
model User {
  @key id: uuid;

  @check("users_credits_non_negative", "credits >= 0")
  credits: int32 = 0;

  @manyToMany("user_badges")
  badges?: Badge[];
}

@table
model Badge {
  @key id: uuid;

  @manyToMany("user_badges")
  users?: User[];
}

@table
model Membership {
  @key id: uuid;
  organizationCode: string;

  @foreignKey("organizationCode", "code")
  organization: Organization;
}
```

## Generated Behavior

### Columns

DBML column generation preserves:

- scalar type mapping
- optional vs required nullability
- soft-delete nullability
- precision on decimal types
- lookup-derived scalar columns

### Constraints

DBML preserves:

- primary keys
- uniques
- indexes
- composite constraints
- named checks as notes on the relevant column

### Relations

DBML refs preserve:

- referenced-column foreign keys
- `@onDelete`
- `@onUpdate`

### Many-to-many shorthand

For `@manyToMany(...)`, the emitter synthesizes:

- a join table
- two refs from the join table to the participating tables

## How Checks And Lookup Types Render

DBML is documentation-oriented output, so some runtime-level concepts are represented in DBML-friendly ways:

- named checks are preserved in column notes
- lookup-derived fields resolve to the source property's scalar type instead of rendering as opaque TypeSpec syntax
- FK delete and update actions are preserved in `Ref:` metadata

This makes DBML useful for review even when the source schema uses richer TypeSpec constructs.

## Supported Features

- namespace-aware grouping
- namespace-split output
- lookup-type scalar emission
- enum columns with indexes and uniques
- FK action preservation
- synthesized many-to-many join tables
- shared filtering with `include` and `exclude`

## Limitations

- DBML is documentation-oriented output, so named checks are preserved as notes rather than a richer DBML-native construct
- many-to-many shorthand remains simple join-table generation; payload-column junctions should be explicit models

## Review Workflow

A practical way to use DBML in a team workflow:

1. update the TypeSpec schema
2. regenerate DBML with `pnpm run compile-examples` or your project compile step
3. review the namespace-specific `.dbml` files in diffs
4. use DBML output for architecture review, diagrams, or handoff documentation

Because the files are generated from the same normalized graph as the runtime emitters, DBML diffs are a reliable signal for schema drift.

## Common Gotchas

- DBML output is not a migration tool; it is a review/documentation artifact
- if you need payload fields on a join, model the junction table explicitly instead of relying on shorthand
- selector filtering still enforces dependency closure, even though the output is documentation-focused

## Verification

The repo verifies DBML generation through:

```sh
pnpm run compile-examples
git diff --exit-code -- outputs
```

## Related Docs

- [`README.md`](/home/qninh/projects/typespec-libraries/README.md)
- [`packages/typespec-orm/README.md`](/home/qninh/projects/typespec-libraries/packages/typespec-orm/README.md)

---

Made with heart by @qninhdt, with GPT-5.4 and Claude Opus 4.6.
