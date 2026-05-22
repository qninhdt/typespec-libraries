# FAQ

## Why PostgreSQL only?

The persistence emitters (Ent, SQLModel) target PostgreSQL because
that's what the core team ships. Supporting MySQL or SQLite would mean
introducing best-effort fallbacks for `jsonb`, `inet`, `tsvector`,
`citext`, `enum`, named CHECK constraints, and so on — exactly the
silent fallbacks the strictness rule is meant to avoid.

DBML and Zod don't care about engine. If you need MySQL-specific
output, you can author your own emitter on top of
`@qninhdt/typespec-orm`.

## Why Ent and SQLModel?

They cover the two most common service stacks (Go and Python) with
mature schema-first APIs and reasonable migration tooling (Atlas).

GORM was an earlier direction; it was removed because its schema
expression is ergonomically Go-first and round-trips poorly through a
language-agnostic graph.

## Why not GORM, Prisma, Drizzle, or Diesel?

Out of scope for the core team. The architecture supports them — see
[typespec-orm](/emitters/orm) for the public surface — but the core
team isn't shipping them.

## Can I author my own emitter?

Yes. Import `@qninhdt/typespec-orm`, call `normalizeOrmGraph(program)`,
and walk `NormalizedOrmModel` entries. The graph carries everything
your emitter needs — namespace path, kind (table / mixin / data),
columns, relations, mixins, scopes.

The Ent and SQLModel emitters are good references; both are under
1500 LOC of TypeScript.

## Why are namespaces required?

See [Why namespace-first](/guide/why-namespace-first). Short version:
the namespace is the only stable, language-agnostic organizing unit
across Go, Python, TypeScript, and DBML output. Forcing it makes
selectors portable.

## Can a model belong to two namespaces?

No. A model has one namespace. Cross-cutting selection is what
[`@scope`](/guide/concepts/scopes) is for.

## What's the difference between `@table` and `@data`?

- `@table` — persisted. Picked up by Ent, SQLModel, DBML.
- `@data` — DTO / form. Picked up by Zod (and treated as a struct /
  Pydantic model by Ent / SQLModel for non-table use).

A model in a namespace without either decorator is treated as a default
form model — Zod emits it; persistence emitters skip it.

## What's a lookup type?

`Demo.Platform.Accounts.User.email` is a lookup type — referencing a
property of a model rather than declaring a fresh scalar. The lookup
inherits the source's scalar plus its constraints (`@maxLength`,
`@format`, etc.).

Use lookup types for form fields that should match a column exactly:

```typespec
inviteeEmail: Demo.Platform.Accounts.User.email;
```

If `User.email` later grows a `@maxLength(320)`, every lookup-type
consumer picks it up.

## Why is `@onUpdate` a warning on Ent?

Ent doesn't natively emit ON UPDATE clauses on FKs. By default
`@onUpdate(...)` is dropped and the emitter logs
`on-update-not-supported-by-ent`. Set
`on-update-emit-raw-sql: true` to surface it as a SQL annotation
comment for review.

## Why does Ent reject referenced-column FKs?

Ent's edge model assumes the FK points at the target's primary key.
Referenced-column FKs (pointing at any `@unique` column) generate
`referenced-column-fk-not-supported-by-ent`. SQLModel and DBML accept
them.

## Do generated outputs need to be checked in?

That's your call. The repo's own examples check generated outputs
into `outputs/` so CI can detect drift between the schema and the
artifacts. Many service repos prefer to regenerate on every build
instead.

## What about migrations?

Use Atlas. Ent generates `atlas.hcl` automatically when
`standalone: true`. SQLModel generates one with `emit-atlas: true`.
DBML doesn't generate migrations — it's a documentation surface.

## Where do I report bugs?

[github.com/qninhdt/typespec-libraries/issues](https://github.com/qninhdt/typespec-libraries/issues).
Include the failing `.tsp` and the diagnostic code.
