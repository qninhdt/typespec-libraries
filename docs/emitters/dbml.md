# `@qninhdt/typespec-dbml`

DBML output for database review and architecture documentation.

## When to use it

Use this when you want a human-reviewable view of the schema —
[dbdiagram.io](https://dbdiagram.io) renders it visually, and DBML
diffs nicely in PRs. Many teams generate DBML alongside Ent / SQLModel
as a review artifact.

## Installation

```sh
pnpm add -D @qninhdt/typespec-dbml @qninhdt/typespec-orm @typespec/compiler
```

## Configuration reference

```yaml
emit:
  - "@qninhdt/typespec-dbml"

options:
  "@qninhdt/typespec-dbml":
    output-dir: "./outputs/dbml"
    filename: "schema"
    split-by-namespace: false
    project-name: "schema"
    include: []
    exclude: []
    auto-include-dependencies: false
```

| Option                      | Type     | Default          | Description                                |
| --------------------------- | -------- | ---------------- | ------------------------------------------ |
| `output-dir`                | string   | compiler default | Output directory.                          |
| `filename`                  | string   | `"schema"`       | Single-file output base name (no `.dbml`). |
| `split-by-namespace`        | boolean  | `false`          | Emit one file per namespace group.         |
| `project-name`              | string   | `"schema"`       | DBML `Project` header (single-file mode).  |
| `include` / `exclude`       | string[] | —                | Selectors.                                 |
| `auto-include-dependencies` | boolean  | `false`          | Pull required deps transitively.           |

## Output modes

### Single-file (default)

```
schema.dbml
```

Contains:

- A `Project { database_type: 'PostgreSQL' }` header.
- Hoisted `Enum` blocks at the top.
- One `Table` block per `@table`, grouped by section comments per
  namespace.
- One `TableGroup` per namespace.
- Trailing `Ref:` lines for FKs and many-to-many associations.

### Split mode

`split-by-namespace: true` emits one `.dbml` per namespace into a
folder tree matching `namespacePath`:

```
demo/
  platform/
    accounts.dbml
    worlds.dbml
shared.dbml
```

Each file has its own `Project` header and its own `Ref:` lines. There
are no cross-file refs — relations across files surface in their
owning side's file with the foreign table name.

## Schema example

```typespec
namespace Demo.Platform.Accounts;

@table
model Badge {
  @key id: uuid;
  @unique @maxLength(80) code: string;
  @maxLength(160) label: string;
}

enum SubscriptionPlan { free, pro, enterprise }
```

Generates:

```dbml
Project schema {
  database_type: 'PostgreSQL'
}

Enum SubscriptionPlan {
  free
  pro
  enterprise
}

// === Demo.Platform.Accounts ===

Table badges {
  id uuid [pk]
  code varchar(80) [unique, not null]
  label varchar(160) [not null]

  Indexes {
    code [unique]
  }
}

TableGroup demo_platform_accounts {
  badges
}
```

## Generated behavior

### Columns

- TypeSpec scalars map to DBML types: `uuid`, `varchar(n)`, `text`,
  `int`, `bigint`, `boolean`, `timestamp`, `jsonb`, etc.
- `@maxLength(n)` on a `string` becomes `varchar(n)`.
- Nullable properties (with `?`) render as `null`; non-nullable ones
  get `not null`.
- Defaults and enum membership surface as `default: ...` settings.

### Constraints

- `@key` → `[pk]`.
- `@unique` → `[unique]` per-column or in an `Indexes { ... [unique] }`
  block.
- `@check("name", "expr")` → preserved as a column note.
- Composite uniques and indexes from `@@tableUnique` / `@@tableIndex`
  → `Indexes { ... }` block.

### Relations

- `@foreignKey` produces a `Ref: table.col > target.col` line. The
  symbol is picked based on cardinality:
  - `>` — many-to-one.
  - `-` — one-to-one.
  - `<` — one-to-many (inverse).
- `@onDelete` / `@onUpdate` actions render as `[delete: cascade,
update: restrict]`.

### Many-to-many shorthand

`@manyToMany("user_badges")` synthesizes an explicit join table block
plus two `Ref:` lines connecting the two endpoints to it. The join
table appears with `note: 'auto-generated'`.

### Enums

Hoisted to the top of the file (single-file mode) or per-file
(split mode). Deduplicated across the schema.

### How checks render

`@check("users_credits_non_negative", "credits >= 0")` becomes a column
note:

```dbml
credits int [not null, default: 0, note: 'check users_credits_non_negative: credits >= 0']
```

DBML doesn't have first-class CHECK constraint syntax, so notes are
the lossless review surface.

## Diagnostics

See [Reference / Diagnostics](/reference/diagnostics#qninhdttypespec-dbml).

- `unsupported-type` (error)
- `invalid-enum-default` (warning)
- `emit-write-failed` (error)
- `association-column-type-fallback` (error)

## Review workflow

1. Add `@qninhdt/typespec-dbml` to your `tspconfig.yaml`.
2. Generate on every PR via CI. Check the `.dbml` files into the repo.
3. Reviewers open `outputs/dbml/schema.dbml` in
   [dbdiagram.io](https://dbdiagram.io) for a visual diff.
4. Schema changes in PRs become diagram diffs in the review tool.

## Verification

```sh
pnpm run compile-examples
pnpm run validate-examples:dbml  # checks generated files exist and aren't empty
```
