# Decorator Reference

Every decorator exported by `@qninhdt/typespec-protobuf`. All live in the
`Openlet.Proto` namespace — bring them into scope with `using Openlet.Proto;`.

> **Source:** `src/decorators-message.ts`, `src/decorators-service.ts`, `src/decorators-field.ts`.

## Name-collision policy

Two decorator names collide with libraries that share scope. Both require qualification:

| Bare name  | Collides with                             | When                                                                 | Resolution                                       |
| ---------- | ----------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------ |
| `@service` | core `TypeSpec.service` (always in scope) | always                                                               | `@Openlet.Proto.service`                         |
| `@ignore`  | `Qninhdt.Orm.ignore`                      | only when `using Qninhdt.Orm;` is also active (e.g. `@entity` files) | `@Openlet.Proto.ignore` vs `@Qninhdt.Orm.ignore` |

Files importing only one library use the bare name freely.

## Message-level

### `@message(overrideName?: string)`

**Target:** `Model`. Marks a model as a proto message. The optional `overrideName`
overrides the emitted message name when the TypeSpec model name differs from the
desired proto identifier.

```typespec
@message
model GetUserResponse {
  @field(1) userId: string;
  @field(2) displayName: string;
}
```

### `@field(n: uint32)`

**Target:** `ModelProperty`. Pins the proto field number. Required on every emitted
property of a plain `@message` (entities allocate numbers automatically — see
[allocator.md](./allocator.md)). Field numbers are part of the wire protocol —
changing one is a breaking change.

```typespec
model Example {
  @field(1) test: string;
}
```

### `@reserve(...reservations: (uint32 | string | [uint32, uint32])[])`

**Target:** `Model | Enum`. Reserves field numbers, names, and inclusive ranges.
Works on **both messages and enums** (closes an upstream `@typespec/protobuf` gap).
Use value-literal syntax (`#[...]`) for ranges.

```typespec
@message
@reserve(#[8, 15], 100, "legacyId")
model Example { @field(1) id: string; }

@reserve(#[100, 199])
enum QuotaKind { unspecified, storage, bandwidth }
```

### `@oneof(name: string)`

**Target:** `ModelProperty`. Groups properties into a single proto `oneof` block.
All properties carrying `@oneof("foo")` on the same model emit as members of
`oneof foo`. A oneof must have ≥ 2 members.

```typespec
@message
model Payload {
  @oneof("body") @field(1) textBody: string;
  @oneof("body") @field(2) bytesBody: bytes;
}
```

## Service-level

### `@Openlet.Proto.service`

**Target:** `Interface`. Marks an interface as a proto service; its operations
become RPCs. **Always qualify** — collides with core `TypeSpec.service`.

```typespec
@Openlet.Proto.service
interface UserService {
  getUser(...GetUserRequest): GetUserResponse;
}
```

### `@rpc(overrideName?: string)`

**Target:** `Operation`. Optional override for the emitted RPC name. Defaults to
the operation's TypeSpec name.

### `@keepEmptyRequest`

**Target:** `Operation`. Suppresses the empty-request → `google.protobuf.Empty`
rewrite, preserving a named empty request message for forward compatibility.
Empty **responses** are never rewritten regardless.

### `@package(name: string, details?: {...})`

**Target:** `Namespace`. Declares a namespace as a proto package. Replaces
`@TypeSpec.Protobuf.package`. `details` accepts per-language options.

```typespec
@package("openlet.user.v1", #{
  goPackage: "github.com/openlet/user-service/proto/gen/go/openlet/user/v1",
  javaPackage: "io.openlet.user.v1",
  javaMultipleFiles: true,
})
namespace Openlet.UserProto;
```

| Detail               | Emits                                  |
| -------------------- | -------------------------------------- |
| `goPackage`          | `option go_package = "...";`           |
| `javaPackage`        | `option java_package = "...";`         |
| `javaOuterClassname` | `option java_outer_classname = "...";` |
| `javaMultipleFiles`  | `option java_multiple_files = true;`   |
| `csharpNamespace`    | `option csharp_namespace = "...";`     |
| `phpNamespace`       | `option php_namespace = "...";`        |
| `rubyPackage`        | `option ruby_package = "...";`         |
| `options`            | free-form `option key = value;` lines  |

## Field-level

### `@Openlet.Proto.ignore`

**Target:** `ModelProperty`. Drops a property from proto emit. Qualify when
`Qninhdt.Orm` is also in scope.

### `@rename(name: string)`

**Target:** `ModelProperty`. Overrides the auto-generated snake_case field name.

```typespec
@rename("oauth2_id_token") @field(1) oauth2IDToken: string;
```

### `@goType(importPathAndType: string)`

**Target:** `ModelProperty`. Overrides the Go binding type for `bytes`/`jsonb`
fields. The argument is a Go import path + symbol separated by a dot
(split at the LAST dot so dotted module paths parse).

```typespec
@goType("github.com/openlet/file-service/internal/file.Metadata")
@field(2) metadata: bytes;
```

### `@map(key: string, value: string)`

**Target:** `ModelProperty`. Forces `map<K, V>` emission when the type alone is
ambiguous. Both `key` and `value` are proto type names rendered verbatim.
Map keys must be an integral type or `string`.

```typespec
@map("string", "openlet.user.v1.UserSettings") @field(1) bag: Record<UserSettings>;
```

## Out of scope (this version)

- **Streaming RPCs** (`stream Foo`) — not supported. Add `@stream` in a follow-up
  plan when a real consumer surfaces. openlet has zero streaming RPCs today.
- **`@deprecated`** — use the TypeSpec built-in; the emitter reads it via
  `getDeprecated()` and emits `option deprecated = true;` on messages, fields,
  enums, and RPCs.
