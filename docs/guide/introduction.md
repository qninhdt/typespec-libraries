# Introduction

`@qninhdt/typespec-libraries` is a set of TypeSpec packages that turn a
single TypeSpec schema into production-ready code for several backends
at once.

It exists because most teams keep re-typing the same schema in three or
four places — once in their Go service, once in their Python worker,
once in a Zod form validator, and once in a DBML diagram. Every change
becomes a four-way diff. Every drift becomes a bug.

This monorepo proposes a different default: **TypeSpec is the schema**,
and every emitter consumes the _same_ normalized ORM graph.

## The five packages

| Package                      | Output                       | Purpose                                                            |
| ---------------------------- | ---------------------------- | ------------------------------------------------------------------ |
| `@qninhdt/typespec-orm`      | none (shared core)           | Validation, normalization, relation resolution, selector filtering |
| `@qninhdt/typespec-ent`      | Go packages for Ent          | Persisted models and DTOs for Go services                          |
| `@qninhdt/typespec-sqlmodel` | Python packages for SQLModel | Persisted models and DTOs for Python services                      |
| `@qninhdt/typespec-zod`      | Zod schemas + inferred types | Frontend and API validation for default form models                |
| `@qninhdt/typespec-dbml`     | DBML files                   | Database review and architecture documentation                     |

Plus upstream `@typespec/protobuf` for cross-service contracts.

## What you get

- **One schema.** Author models once with TypeSpec.
- **Strict validation.** ~70 named diagnostics catch schema mistakes
  before any code is generated.
- **Namespace-first output.** Your TypeSpec namespaces directly become
  Go packages, Python packages, TypeScript modules, and DBML namespace
  groups. No emitter-specific folder options.
- **Standalone packages.** Generate ready-to-publish artifacts —
  `go.mod`, `pyproject.toml`, `package.json` — and drop them into your
  service repos.
- **PostgreSQL-only persistence emitters.** Honest defaults instead of
  silent best-effort fallbacks for MySQL or SQLite.

## What you don't get

- Database migrations are not in scope. Use Atlas — Ent emits
  `atlas.hcl` for you, and SQLModel can too with `emit-atlas: true`.
- Runtime ORM helpers, query builders, or repositories. The output is
  schema material; you bring the runtime.
- MySQL or SQLite. The persistence emitters target PostgreSQL. DBML and
  Zod don't care about engine.

## Where to go next

- New here? Read [Why namespace-first](/guide/why-namespace-first), then
  jump to the [Quickstart](/guide/quickstart).
- Already know TypeSpec? Skip to the [Quickstart](/guide/quickstart).
- Looking for a specific decorator or diagnostic? Use
  [Reference](/reference/decorators/).
- Want to see real schemas in action? See
  [Examples](/examples/).
