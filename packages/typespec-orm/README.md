# @qninhdt/typespec-orm

Shared TypeSpec ORM library used by all emitters in this repository.

This package is where the schema contract actually lives. It defines decorators, validation behavior, relation resolution, namespace normalization, selector filtering, and the normalized ORM graph consumed by the emitters.

## What This Package Owns

`@qninhdt/typespec-orm` is responsible for:

- declaring the public decorators used in TypeSpec
- validating ORM-managed declarations
- resolving relation ownership and foreign keys
- expanding `@tableMixin`
- building the normalized namespace-aware model graph
- applying shared `include` / `exclude` selection logic
- surfacing shared diagnostics before emitters write files

It does not emit code by itself.

## Installation

```sh
pnpm add -D @typespec/compiler @qninhdt/typespec-orm
```

## Importing The Library

```typescript
import "@qninhdt/typespec-orm";

using Qninhdt.Orm;
```

## Core Concepts

### Namespaces are required

`@table`, `@data`, and `@tableMixin` must be declared inside a namespace. Required referenced declarations must also be namespaced.

This matters because the shared ORM graph treats namespaces as the source of truth for:

- output paths
- package structure
- import calculation
- selector filtering
- dependency validation

### `@tableMixin`

`@tableMixin` exists for reusable persisted field groups.

Mixins:

- are validated
- can inherit from other mixins
- can be composed into tables
- are never emitted as standalone tables

Field collisions between mixins or between a mixin and a child model are errors.

### Shared normalization

Emitters do not re-discover tables independently anymore. They consume the normalized graph produced by the ORM core, which includes:

- kind: table, data, or mixin
- namespace and namespace path
- namespace-derived output directory
- dependencies on models, mixins, enums, and scalars
- selected models after filtering

## Normalized Graph Contract

The normalized graph is the contract between this package and the emitters. Each normalized model includes:

- its ORM kind: `table`, `data`, or `mixin`
- full dotted declaration name
- namespace segments and a snake_case namespace path
- namespace-derived output directory and leaf package name
- resolved mixin sources
- hard and soft dependencies on models, mixins, enums, and scalars

That shared graph is what makes the emitters behave consistently. GORM, SQLModel, Zod, and DBML no longer perform their own disconnected model discovery passes.

## Namespace Normalization Rules

Namespace handling is intentionally deterministic:

- namespace segments are preserved for selection and diagnostics
- output paths convert each segment with `camelToSnake`
- package or module leaf names come from the final normalized namespace segment
- root-level declarations are rejected instead of being assigned an implicit folder

Example:

```typescript
namespace Demo.GamePlatform.Content.Stories;
```

normalizes to:

- namespace: `Demo.GamePlatform.Content.Stories`
- namespace path: `["demo", "game_platform", "content", "stories"]`
- namespace directory: `demo/game_platform/content/stories`
- package leaf: `stories`

## Decorator Reference

### Model decorators

- `@table(name?)`
  Marks a model as a persisted table. If `name` is omitted, the table name is derived from the model name.

- `@tableMixin`
  Marks a model as a reusable ORM mixin.

- `@data(label?)`
  Marks a model as a non-table data shape for forms and DTOs.

### Column and persistence decorators

- `@map(columnName)`
  Overrides the emitted column name.

- `@index(name?)`
  Adds a non-unique index.

- `@unique`
  Adds a unique constraint for the field.

- `@check(name, expression)`
  Adds a named database check constraint anchored to the property.

- `@precision(precision, scale?)`
  Adds numeric precision metadata.

- `@autoIncrement`
  Marks an integer field as auto-incrementing.

- `@softDelete`
  Marks a datetime field as the soft-delete column.

- `@autoCreateTime`
  Marks a datetime field as create timestamp metadata.

- `@autoUpdateTime`
  Marks a datetime field as update timestamp metadata.

- `@ignore`
  Removes a property from persistence emitters.

### Relation decorators

- `@foreignKey(localField, referencedField?)`
  Declares the owning side of a relation using a local field and an optional referenced target field.

- `@mappedBy(inverseProperty)`
  Declares the inverse side of a relation.

- `@manyToMany(joinTableName)`
  Declares many-to-many shorthand on an array relation.

- `@onDelete(action)`
  Declares FK delete behavior.

- `@onUpdate(action)`
  Declares FK update behavior.

### Form metadata decorators

- `@title(text)`
- `@placeholder(text)`
- `@@inputType(scalar, htmlType)`

`@@inputType` targets a scalar. When applied to a field, use `Field::type` or the source scalar for lookup-typed fields:

```typescript
@@inputType(CreateWorldForm.summary::type, "textarea");
@@inputType(Demo.Worlds.World.prompt::type, "textarea");
```

## Basic Example

```typescript
import "@qninhdt/typespec-orm";

using Qninhdt.Orm;

namespace Demo.Shared;

@tableMixin
model Timestamped {
  @key id: uuid;
  @autoCreateTime createdAt: utcDateTime;
  @autoUpdateTime updatedAt?: utcDateTime;
}

namespace Demo.Accounts;

@table
model User is Demo.Shared.Timestamped {
  @unique
  @maxLength(320)
  @format("email")
  email: string;

  @check("users_credits_non_negative", "credits >= 0")
  credits: int32 = 0;

  @manyToMany("user_badges")
  badges?: Badge[];
}

@table
model Badge is Demo.Shared.Timestamped {
  @unique code: string;

  @manyToMany("user_badges")
  users?: User[];
}

namespace Demo.Worlds;

@table
model World is Demo.Shared.Timestamped {
  ownerId: uuid;
  slug: string;

  @foreignKey("ownerId")
  owner: Demo.Accounts.User;
}

namespace Demo.Forms;

@data("Create Invitation Form")
model CreateInvitationForm {
  @title("Invitee Email")
  @placeholder("friend@example.com")
  inviteeEmail: Demo.Accounts.User.email;
}
```

## Relation Semantics

### Owned relations

Owned relations are declared on the navigation property:

```typescript
authorId: uuid;

@foreignKey("authorId")
author: User;
```

The optional second argument targets a non-`id` field:

```typescript
organizationCode: string;

@foreignKey("organizationCode", "code")
organization: Organization;
```

### Inverse relations

```typescript
@mappedBy("author")
posts: Post[];
```

### Many-to-many shorthand

```typescript
@table
model User {
  @key id: uuid;

  @manyToMany("user_badges")
  badges?: Badge[];
}

@table
model Badge {
  @key id: uuid;

  @manyToMany("user_badges")
  users?: User[];
}
```

Rules:

- the property must be an array of `@table` models
- both sides must declare `@manyToMany`
- both sides must use the same join table name
- shorthand conflicts with an explicit table of the same name
- shorthand is for simple joins only; payload-column join tables should be modeled explicitly

## Lookup Types And Property Reuse

This package supports source-property reuse patterns such as:

```typescript
@data
model PublicUser {
  email: Demo.GamePlatform.Accounts.User.email;
}
```

That lets `@data` models and other consumers inherit the source property's underlying scalar type and constraints without duplicating the full column definition manually.

Use lookup types when you want:

- one source of truth for field-level constraints
- consistent frontend and backend validation
- shared field descriptions across namespaces

Avoid lookup types when the derived model needs materially different semantics; define a dedicated property instead.

## Shared Selector Model

Emitters using this core support:

```yaml
include:
  - "Demo.Worlds"
  - "Demo.Forms"
exclude:
  - "Demo.Audit"
```

Selectors can match:

- a namespace subtree
- a concrete declaration

There is no wildcard syntax. Selectors are matched by dotted-name prefix semantics.

Examples:

| Selector                               | Matches                                                            |
| -------------------------------------- | ------------------------------------------------------------------ |
| `Demo.GamePlatform.Forms`              | the entire forms subtree                                           |
| `Demo.GamePlatform.Accounts.User`      | the `User` declaration specifically                                |
| `Demo.GamePlatform.Content`            | all content namespaces below it                                    |
| `Demo.GamePlatform.Audit` in `exclude` | removes the audit subtree even if `Demo.GamePlatform` was included |

Behavior:

- `exclude` wins over `include`
- redundant selectors warn
- selecting a model while excluding a required dependency fails

## Modeling Checklist

Before handing a schema to an emitter, it helps to check these rules:

- every emitted or referenced ORM-managed declaration has a namespace
- shared persisted fragments use `@tableMixin`
- ownership is explicit on foreign-key relations
- many-to-many shorthand is used only for simple join tables
- selector filters still include every required dependency
- names are stable enough for namespace-derived package paths

## Diagnostics

Important diagnostics surfaced by the core include:

- `namespace-required`
- `duplicate-table-name`
- `duplicate-column-name`
- `mixin-cycle`
- `mixin-field-conflict`
- `filtered-dependency`
- `unsupported-relation-shape`
- `foreign-key-local-missing`
- `foreign-key-target-missing`
- `foreign-key-type-mismatch`
- `one-to-one-missing-unique`
- `many-to-many-not-array`
- `many-to-many-target-not-table`
- `many-to-many-missing-inverse`
- `many-to-many-conflicting-table`
- `many-to-many-conflicting-explicit-table`
- `duplicate-constraint-name`

## Troubleshooting Common Diagnostics

### `namespace-required`

The model, mixin, or required dependency lives in the global namespace. Move it under a namespace and recompile.

### `filtered-dependency`

Your emitter selection rules included a model but excluded one of its dependencies. Either widen the include set or stop excluding the dependency.

### `mixin-cycle`

Two or more mixins inherit from each other in a loop. Break the cycle by extracting the shared fields into a separate base mixin.

### `mixin-field-conflict`

Two mixins, or a mixin plus a child model, define the same field name. Phase 1+ intentionally treats this as an error instead of allowing silent override behavior.

### `foreign-key-type-mismatch`

The local field type does not line up with the referenced target field type. Make both sides use compatible scalars.

### `many-to-many-missing-inverse`

Both sides of a shorthand many-to-many relation must opt in. Add the inverse relation with the same join-table name.

## Guidance For Emitter Authors

If you are adding or maintaining an emitter in this repo:

- consume the normalized ORM graph instead of walking raw compiler state ad hoc
- treat namespace-derived output paths as canonical
- reuse shared selector behavior
- rely on shared relation resolution where possible
- do not silently downgrade unsupported persistence mappings

## Limitations And Boundaries

- root-level emitted models are unsupported
- namespace-less dependencies are errors
- many-to-many shorthand does not support payload columns
- mixin field collisions are errors rather than override points

---

Made with heart by @qninhdt, with GPT-5.4 and Claude Opus 4.6.
