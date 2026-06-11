# Scopes

Scopes are tags you can attach to models or properties to mark them
for cross-cutting concerns that don't fit a single namespace —
**frontend exposure**, **Kafka event payloads**, **billing exports**,
and so on.

## The decorator

```typespec
@scope("frontend")
@table
model UserProfile { @key id: uuid; displayName: string; }
```

`@scope` accumulates — a model can carry multiple `@scope(...)`
decorators:

```typespec
@scope("frontend")
@scope("kafka:profile-updated")
@table
model UserProfile { @key id: uuid; }
```

## How emitters use scopes

Selectors of the form `#name` match models tagged with that scope name:

```yaml
"@qninhdt/typespec-zod":
  include: ["#frontend"]
```

This emits every model decorated with `@scope("frontend")`, regardless
of namespace.

Compare with namespace selectors, which match by full name:

```yaml
"@qninhdt/typespec-zod":
  include: ["Demo.Platform.Forms"]
```

A namespace selector matches a single subtree. A scope selector matches
a tag. The two compose — you can include a namespace and exclude a
scope, or vice versa.

## When to use namespace vs scope

Use **namespace selectors** for bounded-context-level output:

> "The identity service's TypeSpec lives at `FileVault.Identity`, so
> the identity service generates with `include: ["FileVault.Identity"]`."

Use **scope selectors** for cross-cutting selection that doesn't align
with bounded contexts:

> "Anything decorated `@scope("frontend")` should appear in the Zod
> output, even if it spans Identity, Storage, and Notifications."

## Real-world pattern

The `frontend` scope is the canonical example:

```typespec
namespace Demo.Platform.Worlds;

@table
model World {
  @key id: uuid;
  @scope("frontend") @maxLength(120) name: string;
  @scope("frontend") @maxLength(2000) prompt: string;
  internalMetadata: jsonb; // not exposed
}

namespace Demo.Platform.Forms;

@scope("frontend")
@data
model CreateWorldForm {
  name: Demo.Platform.Worlds.World.name;
  prompt: Demo.Platform.Worlds.World.prompt;
}
```

The Zod emitter, configured with `include: ["#frontend"]`, picks up:

- `CreateWorldForm` — explicitly tagged.
- The `name` and `prompt` properties on `World` — also tagged.

The persistence emitters (Ent, SQLModel) use `include: ["Demo.Platform"]`
and ignore the scope. Same source, different surfaces.

## Diagnostics

- `unused-scope` — a `@scope("name")` is declared but no `#name`
  selector references it. Either remove the decorator or add the
  selector.

## Property-level scope

Scopes apply to properties as well as models. Marking a property pulls
that property into the selection even if its parent model isn't tagged:

```typespec
@table
model User {
  @key id: uuid;
  @maxLength(320) email: string;
  @scope("frontend") displayName: string;
  passwordHash: string; // never reaches frontend
}
```

For Zod with `include: ["#frontend"]`, `User` shows up but only with
`displayName`. The persistence emitters see all four columns.

Next: the full grammar of [Selectors](/guide/concepts/selectors).
