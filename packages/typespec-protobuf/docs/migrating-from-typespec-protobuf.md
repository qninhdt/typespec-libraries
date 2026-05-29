# Migrating from `@typespec/protobuf`

Mechanical swap recipe for moving a service spec from the upstream
`@typespec/protobuf` emitter to `@qninhdt/typespec-protobuf`. Distilled
from the openlet Phase 7 migration.

## Import + using

```diff
- import "@typespec/protobuf";
- using TypeSpec.Protobuf;
+ import "@qninhdt/typespec-protobuf";
+ using Openlet.Proto;
```

## Decorator translation table

| `@typespec/protobuf`                                            | `@qninhdt/typespec-protobuf`                                       |
| --------------------------------------------------------------- | ------------------------------------------------------------------ |
| `@TypeSpec.Protobuf.message`                                    | `@message`                                                         |
| `@TypeSpec.Protobuf.field(1)`                                   | `@field(1)`                                                        |
| `@TypeSpec.Protobuf.reserve(...)`                               | `@reserve(...)` (now works on enums too)                           |
| `@TypeSpec.Protobuf.service`                                    | `@Openlet.Proto.service` (qualify — collides with core `@service`) |
| `@TypeSpec.Protobuf.package({ name: "x" })`                     | `@package("x")`                                                    |
| `@TypeSpec.Protobuf.package({ name, options: { go_package } })` | `@package("x", #{ goPackage: "..." })`                             |

## What you can DELETE

| Old pattern                                                        | Why it's gone                                                              |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Manual `snake_case` field identifiers                              | The emitter auto-converts camelCase → snake_case. Author camelCase.        |
| `import "google/protobuf/timestamp.proto"` + `WellKnown.Timestamp` | `utcDateTime` auto-maps to `Timestamp` (import auto-emitted).              |
| `WellKnown.Duration` etc.                                          | `duration` auto-maps.                                                      |
| Hand-written `buf.yaml` / `buf.gen.yaml`                           | Auto-generated (Phase 6). Delete or keep the header marker to allow regen. |
| Hand-written `option go_package` in `.proto`                       | Emitted from `@package` details / `go-package-prefix`.                     |

## Field-name pitfalls

The snake_case algorithm splits on a lowercase/digit → uppercase boundary:

| camelCase     | snake_case      |
| ------------- | --------------- |
| `userId`      | `user_id`       |
| `userIDsHash` | `user_ids_hash` |
| `IPv4Address` | `ipv4_address`  |
| `OAuth2Token` | `oauth2_token`  |
| `httpURL`     | `http_url`      |

If a name converts to something other than the existing wire name, pin it with
`@rename("explicit_wire_name")` to avoid a wire break. Pre-flight every migration
with `make json-breaking`.

## Empty requests

An RPC with an empty request model is rewritten to `google.protobuf.Empty` by
default (request only — responses keep their named empty type). To preserve a
named empty request, add `@keepEmptyRequest` to the operation.

## Cross-file imports

When a service imports another package's proto types, the emitter writes
`import "openlet/events/v1.proto";` and references the type by its qualified name
(`openlet.events.v1.FileProcessed`) instead of inlining a copy. Set `emit-only`
in `tspconfig` to restrict which packages a consumer writes — e.g. a Python
client that consumes auth/user/file but should not re-emit `events.proto`.

## `@entity` consolidation (optional)

Where a `schemas.tsp` model and its `proto.tsp` twin have the SAME shape, collapse
them into one `@entity` declaration (produces both ORM + proto). Audit per model:

- Same field names, types, shapes? → `@entity`.
- proto diverges (JSONB → string, internal-only fields)? → keep them split.

See [allocator.md](./allocator.md) for how `@entity` field numbers are assigned.

## Per-service gate

After each migration commit:

```
make spec
make ent-gen
make proto
make buf-breaking
make json-breaking
go build ./...        # per Go service
poetry run pytest     # per Python service
```

`make buf-breaking` + `make json-breaking` must be clean against `main`. The
generated `.proto` byte-diff should show ONLY whitespace/comment differences — no
field-number or field-name drift.
