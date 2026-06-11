# `@qninhdt/typespec-orm`

The shared ORM core. Every other emitter in this library consumes
its normalized graph. The package itself doesn't write files.

## What it provides

- All ORM decorators — `@table`, `@tableMixin`, `@foreignKey`,
  `@manyToMany`, `@check`, `@scope`, `@autoCreateTime`, etc. See
  [Reference / Decorators](/reference/decorators/).
- All custom scalars — `uuid`, `email`, `jsonb`, `ulid`, etc. See
  [Reference / Scalars](/reference/scalars).
- Validators — every diagnostic that fires before an emitter is
  invoked. See [Reference / Diagnostics](/reference/diagnostics).
- Normalization — namespace path → snake_case folder, mixin expansion,
  relation resolution, M:N shorthand synthesis, dependency closure.
- Selector evaluation — `include` / `exclude` semantics, scope tags.

## Installation

```sh
pnpm add -D @qninhdt/typespec-orm @typespec/compiler
```

## Importing

```typespec
import "@qninhdt/typespec-orm";

using Qninhdt.Orm;
```

The `using` line brings every decorator and scalar into your TypeSpec
namespace.

## The normalized graph

Internally the orm core builds a `NormalizedOrmGraph` keyed by model
full name. Each entry is a `NormalizedOrmModel`:

```ts
type NormalizedOrmModel = {
  kind: "table" | "tableMixin" | "data" | "form";
  fullName: string; // "Demo.Platform.Accounts.User"
  namespacePath: string[]; // ["Demo", "Platform", "Accounts"]
  namespaceDir: string; // "demo/platform/accounts"
  packageName: string; // top-level: "demo"
  tableName: string | null; // "users", or null for non-tables
  schema: string | null; // PG schema, walked from @schema
  scopes: string[];
  mixins: string[]; // resolved mixin chain
  columns: ResolvedColumn[];
  relations: ResolvedRelation[];
  dependencies: NormalizedDependency[];
  versionColumn: string | null;
  tenantIdColumn: string | null;
};
```

Emitters walk this structure — they don't re-parse the TypeSpec
program.

## Public API for emitter authors

If you're writing an emitter on top of the orm core:

```ts
import {
  normalizeOrmGraph,
  selectModelsForEmitter,
  bootstrapEmitter,
  isBootstrapSuccess,
  buildGeneratedHeader,
  type NormalizedOrmGraph,
  type NormalizedOrmModel,
  type OrmEmitterSelection,
} from "@qninhdt/typespec-orm";
```

Recommended flow:

```ts
import type { EmitContext } from "@typespec/compiler";

export async function $onEmit(context: EmitContext<MyOptions>) {
  const bootstrap = bootstrapEmitter(context, {
    libraryName: "@qninhdt/typespec-mything",
    options: context.options,
  });
  if (!isBootstrapSuccess(bootstrap)) return; // diagnostics already reported

  const { graph, selection, outputDir, header } = bootstrap;

  for (const model of selection.models) {
    const path = `${outputDir}/${model.namespaceDir}/${snake(model.name)}.ts`;
    const body = renderModel(model, header);
    await context.program.host.writeFile(path, body);
  }
}
```

`bootstrapEmitter` runs the four checks every emitter needs:

1. Validates `library-name` if `standalone: true`.
2. Calls `normalizeOrmGraph(program)`.
3. Applies selectors via `selectModelsForEmitter`.
4. Resolves the output directory.

Failure is reported as diagnostics; the emitter just bails.

## Naming helpers

The orm core ships small naming utilities so every emitter agrees:

- `camelToSnake("emailAddress")` → `"email_address"`.
- `camelToPascal("user_account")` → `"UserAccount"`.
- `deriveTableName("UserAccount")` → `"user_accounts"`.
- `truncatePgIdentifier("a_very_long_name", PG_MAX_IDENTIFIER_LENGTH)` —
  truncates with a stable hash suffix when over PG's 63-char limit.

## Identifier policy

PostgreSQL has a 63-character identifier limit. The orm core enforces
this consistently:

- `PG_MAX_IDENTIFIER_LENGTH = 63`.
- `truncatePgIdentifier(name)` truncates with a stable hash suffix.
- `isPgReservedWord(name)` returns true for SQL reserved words.

The `pg-reserved-identifier` warning fires when a column or table name
clashes with a reserved word.

## Boundaries

- The orm core never writes files.
- It doesn't know about Go, Python, TypeScript, or DBML.
- Every emitter is responsible for its own language-specific
  diagnostics (e.g., Ent's `cross-package-edge`).

## Related

- [Why namespace-first](/guide/why-namespace-first) — design rationale.
- [Reference / Decorators](/reference/decorators/) — full surface.
- [Reference / Diagnostics](/reference/diagnostics) — every error and
  warning.
