# Selectors

Selectors decide which models an emitter writes. The same selector
grammar works across **every** emitter — Ent, SQLModel, Zod, DBML.

## The grammar

A selector is a string. Two flavors:

- **Namespace selector** — a dotted name like `Demo.Platform.Accounts`
  or `Demo.Platform.Worlds.World`.
- **Scope selector** — a `#`-prefixed tag like `#frontend` or
  `#kafka:upload-events`.

That's it. **No wildcards.** No globs. No regex.

## The two lists

Every emitter takes two lists:

```yaml
options:
  "@qninhdt/typespec-ent":
    include:
      - "Demo.Platform"
    exclude:
      - "Demo.Platform.Audit"
```

Behavior:

- An empty `include` means "everything".
- `exclude` wins over `include`.
- Redundant selectors warn (`filter-selector-redundant`).
- Conflicting selectors error (`filter-selector-conflict`).

## Namespace matching

Namespace selectors are **prefix** matches against the full namespace
path of each model:

| Selector                     | Matches                                             |
| ---------------------------- | --------------------------------------------------- |
| `Demo`                       | every model under `Demo.*`                          |
| `Demo.Platform`              | every model under `Demo.Platform.*`                 |
| `Demo.Platform.Worlds`       | every model in `Demo.Platform.Worlds` and below     |
| `Demo.Platform.Worlds.World` | only the `World` model and anything nested below it |

## Scope matching

A `#name` selector matches models or properties carrying
`@scope("name")`. Scopes don't follow namespaces — a `#frontend`
selector picks up tagged models from anywhere.

```yaml
"@qninhdt/typespec-zod":
  include: ["#frontend"]
```

## Combining lists

```yaml
include:
  - "Demo.Platform" # everything under Demo.Platform
  - "#kafka" # plus anything tagged @scope("kafka")
exclude:
  - "Demo.Platform.Audit" # but skip the audit subtree
```

Resolution order:

1. Start with everything matched by `include` (or all models if
   `include` is empty).
2. Remove everything matched by `exclude`.
3. Apply dependency closure (see below).

## Dependency closure

If a selected model depends on something filtered out — a `@tableMixin`,
a target of `@foreignKey`, an enum used in a column — emission fails
with `filtered-dependency`.

Two ways to resolve it:

### Expand the include list

```yaml
include:
  - "Demo.Platform.Accounts"
  - "Demo.Platform.Shared" # mixins live here
```

### Enable auto-include-dependencies

```yaml
include:
  - "Demo.Platform.Accounts"
auto-include-dependencies: true
```

`auto-include-dependencies: true` transitively pulls required mixins,
FK targets, and enum types into the selection. Recommended for
service configs so you don't have to enumerate `*.Shared` mixins by
hand. Default is `false` to keep the strict `filtered-dependency`
diagnostic.

## Selector resolution is uniform

The orm core resolves selectors once. The same selector list produces
the same model set for Ent, SQLModel, Zod, and DBML. That's why a
service can configure all of its emitters from one shared
`include` block.

## Common pitfalls

- **Forgot the namespace.** `include: ["User"]` doesn't match
  `Demo.Platform.Accounts.User` — selectors are prefix matches against
  full names. Use `Demo.Platform.Accounts.User` or just
  `Demo.Platform.Accounts`.
- **Excluded a mixin.** `Demo.Platform.Shared.Timestamped` is needed by
  most tables. Either include it explicitly or set
  `auto-include-dependencies: true`.
- **Used a wildcard.** There is no wildcard syntax. Selectors are exact
  prefixes or scope tags.

## Diagnostics

- `filtered-dependency` (error) — selected model needs an excluded
  dependency.
- `filter-selector-conflict` (warning) — same selector appears in both
  lists.
- `filter-selector-redundant` (warning) — selector matches the same
  set as a parent selector already in the list.
- `redundant-include-selector` (warning) — selector matches nothing
  beyond what's already included.

Next: how [Standalone packages](/guide/concepts/standalone-packages)
turn the output into a publishable artifact.
