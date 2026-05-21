---
title: "Custom Protobuf Emitter (@qninhdt/typespec-protobuf)"
status: in-progress
created: 2026-05-21
scope: project
phases:
  - id: phase-01
    title: "Package scaffold & decorator library"
    status: pending
  - id: phase-02
    title: "Type mapping engine"
    status: pending
  - id: phase-03
    title: "Enum handling (numeric-only for proto)"
    status: pending
  - id: phase-04
    title: "gRPC service & streaming support"
    status: pending
  - id: phase-05
    title: "Proto file emitter"
    status: pending
  - id: phase-06
    title: "Tests & example integration"
    status: pending
---

# Custom Protobuf Emitter

## Motivation

The built-in `@typespec/protobuf` has several pain points:

1. **Verbose syntax** — requires `@field(N)` on every property (unnecessary; auto-numbering by declaration order is valid proto3)
2. **No automatic type mapping** — `utcDateTime` must be manually mapped to `google.protobuf.Timestamp`, numbers aren't auto-mapped to proto scalar types
3. **Enum confusion** — proto enums are numeric, but ORM enums can be string-valued; the compiler doesn't distinguish between the two contexts

## Design Decisions

### No `@field(index)` — Auto-numbering

Field numbers are assigned sequentially by declaration order (1-based). This is safe for proto3 and eliminates boilerplate. If a user ever needs to pin a field number (rare, for wire-compat), we can add an optional `@protoField(n)` decorator later — but it's not in scope now.

### Separate `main.tsp` — Not in typespec-orm

Proto decorators live in their own package (`@qninhdt/typespec-protobuf`) with its own `lib/main.tsp`. The ORM package stays unchanged.

### Enum Strategy

- Proto enums are always numeric (proto3 requirement)
- ORM enums can be string-valued (for DB storage)
- The emitter reads enum member `.value` — if numeric, use directly; if string, assign sequential numbers (0-based, with 0 = unspecified)
- Emit a diagnostic warning if an enum lacks a 0-value member (proto3 requires it)

### Type Mapping (Automatic)

| TypeSpec Type                                            | Proto Type                      |
| -------------------------------------------------------- | ------------------------------- |
| `string`                                                 | `string`                        |
| `boolean`                                                | `bool`                          |
| `int32` / `serial`                                       | `int32`                         |
| `int64` / `bigserial`                                    | `int64`                         |
| `uint32`                                                 | `uint32`                        |
| `uint64`                                                 | `uint64`                        |
| `float32`                                                | `float`                         |
| `float64`                                                | `double`                        |
| `bytes`                                                  | `bytes`                         |
| `utcDateTime` / `offsetDateTime`                         | `google.protobuf.Timestamp`     |
| `duration`                                               | `google.protobuf.Duration`      |
| `uuid` / `text` / `email` / `url` / other string scalars | `string`                        |
| `decimal`                                                | `string` (proto has no decimal) |
| `T[]` (array)                                            | `repeated T`                    |
| `T?` (optional)                                          | `optional T`                    |
| Model reference                                          | message reference               |
| Enum reference                                           | enum reference                  |

### gRPC Features

- `@protoPackage(name)` — sets the proto package name
- `@protoService` — marks an interface as a gRPC service
- `@stream` with modes: `In`, `Out`, `Duplex` — client/server/bidi streaming
- Operations (interface methods) map to RPC methods
- `@protoImport(path)` — explicit import of external proto files

## Phases

| Phase | Title                                  | Status  | Effort |
| ----- | -------------------------------------- | ------- | ------ |
| 01    | Package scaffold & decorator library   | pending | 2h     |
| 02    | Type mapping engine                    | pending | 3h     |
| 03    | Enum handling (numeric-only for proto) | pending | 2h     |
| 04    | gRPC service & streaming support       | pending | 3h     |
| 05    | Proto file emitter                     | pending | 4h     |
| 06    | Tests & example integration            | pending | 3h     |

## Architecture

```
packages/typespec-protobuf/
├── lib/
│   ├── main.tsp          # Proto decorators (protoPackage, protoService, stream, etc.)
│   └── tsp-index.js      # JS entrypoint for tsp
├── src/
│   ├── index.ts          # Package entry, $decorators export
│   ├── lib.ts            # createTypeSpecLibrary, emitter options, diagnostics
│   ├── decorators.ts     # Decorator implementations ($protoPackage, $protoService, etc.)
│   ├── type-mapping.ts   # TypeSpec → proto type resolution
│   ├── enum-mapping.ts   # Enum → proto enum (numeric assignment)
│   ├── proto-emitter.ts  # Main emitter: builds .proto file content
│   ├── proto-service.ts  # gRPC service/rpc/streaming rendering
│   └── testing/
│       └── index.ts      # Test helpers
├── test/
│   └── ...
├── package.json
├── tsconfig.build.json
└── tsconfig.json
```

## Dependencies

- `@typespec/compiler` (peer)
- `@qninhdt/typespec-orm` (workspace dependency — for reading ORM state like enums, scalars)
