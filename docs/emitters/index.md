# Emitters

The library ships five emitters. Pick the ones your stack needs — most
projects use the orm core plus two or three.

<EmitterMatrix />

## At a glance

- [`@qninhdt/typespec-orm`](/emitters/orm) — the shared core. Required
  by every other emitter. Doesn't write files itself.
- [`@qninhdt/typespec-ent`](/emitters/ent) — Go + Ent. Persisted
  models and DTOs for Go services.
- [`@qninhdt/typespec-sqlmodel`](/emitters/sqlmodel) — Python +
  SQLModel. Persisted models and DTOs for Python services.
- [`@qninhdt/typespec-zod`](/emitters/zod) — TypeScript + Zod.
  Frontend / API form validation.
- [`@qninhdt/typespec-dbml`](/emitters/dbml) — DBML. Documentation /
  review surface.

## Picking emitters per service

The repo's own example (see [Examples](/examples/)) follows a simple
rule:

- Each backend service picks **one** persistence emitter — Ent or
  SQLModel, never both.
- Frontends use Zod, with `include: ["#frontend"]` to keep persistence
  details out.
- A `docs/` service emits DBML with no filter so it sees the whole
  schema.

```yaml
# services/identity-svc/tspconfig.yaml
emit:
  - "@qninhdt/typespec-ent"
  - "@typespec/protobuf"

options:
  "@qninhdt/typespec-ent":
    standalone: true
    library-name: "github.com/acme/identity-models"
    include: ["FileVault.Identity"]
    auto-include-dependencies: true
```

## Shared options

Every emitter accepts these:

| Option                      | Type     | Default          | Effect                                          |
| --------------------------- | -------- | ---------------- | ----------------------------------------------- |
| `output-dir`                | string   | compiler default | Override TypeSpec output directory.             |
| `include`                   | string[] | —                | Selectors to keep.                              |
| `exclude`                   | string[] | —                | Selectors to drop (wins over include).          |
| `auto-include-dependencies` | boolean  | `false`          | Pull required mixins / FK targets transitively. |

Persistence emitters (Ent, SQLModel) additionally accept:

| Option                | Values                  | Default   | Effect                                              |
| --------------------- | ----------------------- | --------- | --------------------------------------------------- |
| `standalone`          | boolean                 | `false`   | Emit publishable package (go.mod / pyproject.toml). |
| `library-name`        | string                  | —         | Required when `standalone: true`.                   |
| `collection-strategy` | `"jsonb" \| "postgres"` | `"jsonb"` | How `T[]` columns persist.                          |

The detailed pages for each emitter list every additional option.

## Output layout summary

| Emitter  | One file per                             | Standalone adds                                       |
| -------- | ---------------------------------------- | ----------------------------------------------------- |
| Ent      | `@table` / `@tableMixin` → `ent/schema/` | `go.mod`, `generate.go`, `atlas.hcl`                  |
| SQLModel | `@table` / `@data` per namespace         | `pyproject.toml`, `__init__.py`, optional `atlas.hcl` |
| Zod      | each form model under `src/<namespace>/` | `package.json`, `tsconfig.json`, root barrel          |
| DBML     | one `schema.dbml`, or one per namespace  | n/a                                                   |
