# What is TypeSpec ORM?

TypeSpec ORM is a set of TypeSpec emitters built on top of one shared
core: `@qninhdt/typespec-orm`. The core does the boring,
emitter-agnostic work — namespace normalization, mixin expansion,
relation resolution, selector evaluation, validation — and exposes a
**normalized graph** that every emitter consumes.

## The pipeline

```
                  ┌──────────────────────────────────┐
   .tsp source ──▶│  TypeSpec compiler               │
                  └────────────┬─────────────────────┘
                               │ Program
                               ▼
                  ┌──────────────────────────────────┐
                  │  @qninhdt/typespec-orm           │
                  │   - validate                     │
                  │   - normalize namespace + graph  │
                  │   - resolve relations            │
                  │   - apply selectors              │
                  └────────────┬─────────────────────┘
                               │ NormalizedOrmGraph
                ┌──────────────┼──────────────┬──────────────┐
                ▼              ▼              ▼              ▼
      ┌──────────────┐ ┌──────────────┐ ┌──────────┐ ┌────────────┐
      │ typespec-ent │ │ typespec-    │ │ typespec │ │ typespec-  │
      │   (Go)       │ │  sqlmodel    │ │  -zod    │ │   dbml     │
      │              │ │  (Python)    │ │  (TS)    │ │            │
      └──────────────┘ └──────────────┘ └──────────┘ └────────────┘
```

## What the core owns

`@qninhdt/typespec-orm` defines:

- **All decorators** — `@table`, `@tableMixin`, `@foreignKey`,
  `@manyToMany`, `@check`, `@scope`, `@onDelete`, etc. Around 30 of them.
- **All custom scalars** — `uuid`, `email`, `jsonb`, `ulid`, `inet`,
  and the rest.
- **Validators** — every diagnostic that fires before an emitter is
  invoked.
- **Normalization** — namespace path → snake_case folder, mixin
  expansion, relation resolution, M2M shorthand synthesis.
- **Selector evaluation** — `include` / `exclude` semantics,
  dependency closure, scope tags.

The core never writes files. It produces a `NormalizedOrmGraph` that
emitters render.

## What an emitter owns

Each emitter is a thin renderer:

- It picks a target language (Go, Python, TypeScript) or format (DBML).
- It consumes the normalized graph and writes language-specific files.
- It surfaces language-specific options (Ent's `collection-strategy`,
  Zod's `int64-strategy`, DBML's `split-by-namespace`).

That's the design contract. Emitters don't reinvent validation, FK
resolution, or selectors — they trust the core.

## Why this split

- **Consistency.** A given `.tsp` produces the same model set in
  every emitter. A `filtered-dependency` error from the orm core
  fails before any emitter writes a file.
- **Strictness.** The core fails on unsupported shapes. Emitters
  surface their own diagnostics for language-specific limits
  (e.g., Ent's `referenced-column-fk-not-supported-by-ent`).
- **Extensibility.** Building a new emitter — say, for Drizzle or
  Prisma — means consuming `NormalizedOrmGraph`, not reimplementing
  validation.

## When you might write your own emitter

If you need an output format the library doesn't ship — say, Drizzle
schemas, OpenAPI, or a custom JSON description — you can author one
on top of `@qninhdt/typespec-orm` directly. See
[Emitters / typespec-orm](/emitters/orm) for the public API.
