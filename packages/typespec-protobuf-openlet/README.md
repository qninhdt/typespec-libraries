# @qninhdt/typespec-protobuf-openlet

First-party Protobuf emitter for the openlet TypeSpec stack. Replaces `@typespec/protobuf` with an ergonomic decorator surface, auto type mapping (TypeSpec scalars → proto wire types + well-known messages), automatic camelCase → snake_case field naming, cross-file imports, single-source `@entity` sharing with ent/sqlmodel, and auto-generated buf configs.

> **Status (Phase 1):** Decorator surface only. The emitter (Phase 3+) and `@entity` cross-emitter integration (Phase 5) land in subsequent phases.

## Decorators

| Decorator                    | Target          | Purpose                                                                                                  |
| ---------------------------- | --------------- | -------------------------------------------------------------------------------------------------------- |
| `@message(overrideName?)`    | `Model`         | Marks a model as a proto message. Optional `overrideName` overrides the emitted message name.            |
| `@field(n)`                  | `ModelProperty` | Pins the proto field number. Required on every emitted property unless allocated by `@entity` (Phase 5). |
| `@reserve(...ranges)`        | `Model \| Enum` | Reserved field numbers, ranges, and names. Works on enums (parity gap in upstream).                      |
| `@oneof(name)`               | `ModelProperty` | Groups properties into a `oneof` block.                                                                  |
| `@service`                   | `Interface`     | Marks an interface as a proto service.                                                                   |
| `@rpc`                       | `Operation`     | Optional override for the emitted RPC name.                                                              |
| `@keepEmptyRequest`          | `Operation`     | Suppresses empty-request → `google.protobuf.Empty` rewrite.                                              |
| `@ignore`                    | `ModelProperty` | Drops a property from proto emit.                                                                        |
| `@rename(name)`              | `ModelProperty` | Overrides the auto-generated snake_case field name.                                                      |
| `@goType(importPathAndType)` | `ModelProperty` | Override the Go binding type for `bytes`/`jsonb` cases.                                                  |
| `@map(key, value)`           | `ModelProperty` | Forces `map<K, V>` over a model property when the shape is ambiguous.                                    |
| `@package(name, options?)`   | `Namespace`     | Replaces `@TypeSpec.Protobuf.package`; accepts `goPackage`, `javaPackage`, `csharpNamespace`, etc.       |

> **Streaming RPCs** (`stream Foo`) are intentionally out of scope this version. Add a follow-up plan when a real consumer surfaces.

## Decorator name collision policy

Two known collisions require qualification.

**1. `@service` collides with the always-in-scope core `TypeSpec.service`** (the core decorator marks an API service title; ours marks a proto service interface). Always qualify in spec sources:

```typespec
using Openlet.Proto;

@Openlet.Proto.service
interface UserService {
  getUser(...GetUserRequest): GetUserResponse;
}
```

**2. `@ignore` collides between this library and `@qninhdt/typespec-orm`** when both `using Qninhdt.Orm;` and `using Openlet.Proto;` are active. The TypeSpec compiler emits `ambiguous-decorator-reference`; authors MUST qualify in this case:

```typespec
using Qninhdt.Orm;
using Openlet.Proto;

@entity
model UserProfile {
  @key userId: uuid;
  displayName?: text;

  @Qninhdt.Orm.ignore   internalCounter: int64;     // ORM-only column
  @Openlet.Proto.ignore secretHash: text;           // proto-only suppress
}
```

Files that import only one library don't hit this — bare `@ignore` resolves to the single in-scope binding.

## Public surface

```ts
import {
  $lib,
  PROTO_NAMESPACE,
  isProtoMessage,
  getProtoFieldNumber,
} from "@qninhdt/typespec-protobuf-openlet";
```

Every decorator stores its config on `program.stateMap(...)` via the standard typespec-libraries pattern; the emitter (Phase 3) reads this state.
