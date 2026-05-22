# Why namespace-first

Most code generators give you a `models/` folder and call it a day.
This one doesn't. The TypeSpec namespace **is** the output unit.

## The decision

Every ORM-managed declaration must live inside a namespace. The
namespace controls:

- output folder layout
- package structure (`go.mod` paths, Python package roots, TS exports)
- selection filters (`include` / `exclude`)
- import paths in generated code
- namespace-split DBML output

A model declared at the global namespace is a hard error
(`namespace-required`).

If a team wants a folder called `models`, the namespace must include
`Models`. There is no emitter option to override this.

## Why?

Three reasons.

### 1. Generators always lose information

A flat `models/` folder is a lossy mapping. It loses bounded-context
information that the schema author already wrote down. The namespace
already says `GamePlatform.Worlds` — the file system should reflect
that, not collapse it.

### 2. Cross-language paths must agree

When the same schema generates a Go package, a Python package, and a
DBML diagram, the _only_ shared organizing principle is the namespace.
If Go uses `models/` but Python uses `app/identity/`, your service
boundaries are an emitter implementation detail.

Namespace-first means `Demo.Platform.Accounts` becomes
`demo/platform/accounts/` everywhere — Go, Python, TypeScript, DBML.
The bounded context is portable.

### 3. Filters need a stable name

`include: ["GamePlatform.Worlds"]` only works if the namespace path is
canonical. The same selector behaves the same across Ent, SQLModel,
Zod, and DBML.

## Strict over silent

The repo prefers explicit failure to degraded output. If something
can't be emitted faithfully, it errors:

- `unsupported-type` — the emitter cannot map a field without losing
  semantics. Fix the schema or pick a supported type.
- `filtered-dependency` — your selectors removed something a selected
  model needs.
- `namespace-required` — global-namespace declarations are not allowed.
- `many-to-many-conflicting-explicit-table` — the shorthand collides
  with an explicit junction model.

Best-effort fallbacks would let bad schemas reach production. Errors
make you fix them now.

## Practical implications

- One persistence language per service. Don't ask Ent and SQLModel to
  emit the same namespace — pick one.
- Move root-level models into a real namespace before upgrading from a
  pre-namespace version. See [Migration](/guide/migration).
- If you want a `models/` folder badly, name your namespace `Models`.

Next: try it in the [Quickstart](/guide/quickstart).
