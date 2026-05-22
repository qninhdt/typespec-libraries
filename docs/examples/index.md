# Examples

The repo ships two end-to-end examples that demonstrate the canonical
per-service generation pattern at different scales. Both use the same
folder convention: a shared `contracts/` tree (single source of truth)
plus per-service generation roots under `services/`.

## When to study which

| If you're...                                  | Read                                     |
| --------------------------------------------- | ---------------------------------------- |
| New to the library                            | [Game Platform](/examples/game-platform) |
| Building a single-stack product               | [Game Platform](/examples/game-platform) |
| Designing a multi-service backend             | [File Vault](/examples/file-vault)       |
| Combining Go and Python services              | [File Vault](/examples/file-vault)       |
| Coordinating contracts across team boundaries | [File Vault](/examples/file-vault)       |

## The shared layout

Both examples follow this structure:

```
examples/<system>/
  contracts/
    shared/                 # @tableMixin bases, cross-service primitives
    <bounded-context>/      # tables.tsp + dtos.tsp per service-owned namespace
    frontend/               # @scope("frontend") forms + DTOs
  services/
    <service>-svc/
      main.tsp              # imports the contracts subset this service needs
      grpc.tsp              # @Protobuf.service interfaces
      tspconfig.yaml        # one persistence language + protobuf
    frontend/               # Zod
    docs/                   # DBML, no filter
```

### The rules

- `contracts/` is **read-only schema** — no `tspconfig.yaml`, no
  `@Protobuf.service`. Just models.
- Each service **owns its namespace**. Cross-service consumption
  happens via Kafka events or gRPC, never by importing another team's
  `tables.tsp`.
- **One persistence language per service.** Ent _or_ SQLModel — never
  both for the same namespace.
- Frontends use `include: ["#frontend"]`. Docs use no filter so they
  see the whole schema.

### Why this layout

The split between `contracts/` and `services/` makes one thing
explicit: the schema is the contract. Service implementations come
and go. Languages can change. The schema is what every consumer
agrees on.

## Walkthroughs

- [Game Platform](/examples/game-platform) — single backend (Go/Ent) +
  frontend (Zod) + docs (DBML). The minimal real-world setup.
- [File Vault](/examples/file-vault) — 9 microservices, mixed Go/Python,
  upstream Protobuf contracts, frontend Zod, docs DBML. Demonstrates
  the multi-service playbook.

## Generated outputs in this repo

Both examples have their generated outputs checked into `outputs/` so
CI can detect drift between the schema and the artifacts. Browse them:

- [`outputs/game-platform/`](https://github.com/qninhdt/typespec-libraries/tree/main/outputs/game-platform)
  — `backend/`, `frontend/`, `docs/`
- [`outputs/file-vault/`](https://github.com/qninhdt/typespec-libraries/tree/main/outputs/file-vault)
  — one subdirectory per service

## Useful commands

```sh
pnpm run compile-examples           # regenerate everything
pnpm run compile-example:game-platform
pnpm run compile-example:file-vault
pnpm run validate-examples          # build/typecheck the generated outputs
```
