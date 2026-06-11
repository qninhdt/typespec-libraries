# Game Platform

A small system that demonstrates the canonical setup: one backend
service, one frontend, one docs target. Source is at
[`examples/game-platform/`](https://github.com/qninhdt/typespec-libraries/tree/main/examples/game-platform).

## What it generates

| Service    | Language   | Emitter       |
| ---------- | ---------- | ------------- |
| `backend`  | Go         | typespec-ent  |
| `frontend` | TypeScript | typespec-zod  |
| `docs`     | DBML       | typespec-dbml |

Plus upstream `@typespec/protobuf` for the gRPC contract.

## Repository layout

```
examples/game-platform/
  contracts/
    accounts/
      user.tsp
      badge.tsp
    audit/
    collaboration/
      tables.tsp
      forms.tsp
    content/
    frontend/
    shared/
    worlds/
  services/
    backend/
      main.tsp
      grpc.tsp
      tspconfig.yaml
    frontend/
      main.tsp
      tspconfig.yaml
    docs/
      main.tsp
      tspconfig.yaml
```

## A representative contract

```typespec
// contracts/accounts/user.tsp
import "@qninhdt/typespec-orm";

using Qninhdt.Orm;

namespace GamePlatform.Accounts;

@table
model User {
  ...GamePlatform.Shared.SoftDeletableEntity;
  @unique @maxLength(320) email: email;
  @maxLength(80) handle: string;
  @scope("frontend") @maxLength(120) displayName: string;
  credits: int32 = 0;
  @check("users_credits_non_negative", "credits >= 0")
  creditsCheck?: boolean;
  @manyToMany("user_badges") badges?: Badge[];
}

@table
model Badge {
  ...GamePlatform.Shared.SoftDeletableEntity;
  @unique @maxLength(80) code: string;
  @maxLength(160) label: string;
  @manyToMany("user_badges") users?: User[];
}
```

Notice:

- `@scope("frontend")` on `displayName` — the Zod emitter picks this
  up; persistence emitters take it as just another column.
- `@manyToMany("user_badges")` symmetric on both sides.
- `@check` named so the constraint is identifiable in migrations.

## Backend service config

```yaml
# services/backend/tspconfig.yaml
emit:
  - "@qninhdt/typespec-ent"
  - "@typespec/protobuf"

options:
  "@qninhdt/typespec-ent":
    output-dir: "../../../outputs/game-platform/backend/ent"
    standalone: true
    library-name: "github.com/acme/game-platform-models"
    collection-strategy: "jsonb"
    auto-include-dependencies: true

  "@typespec/protobuf":
    output-dir: "../../../outputs/game-platform/backend/protobuf"
```

The backend doesn't pass `include` — it generates the entire schema
because it owns it. `auto-include-dependencies: true` keeps the
service config tidy.

## Frontend service config

```yaml
# services/frontend/tspconfig.yaml
emit:
  - "@qninhdt/typespec-zod"

options:
  "@qninhdt/typespec-zod":
    output-dir: "../../../outputs/game-platform/frontend/zod"
    standalone: true
    library-name: "@acme/game-platform-forms"
    include: ["#frontend"]
    auto-include-dependencies: true
    int64-strategy: "string"
    branded-scalars: false
```

The frontend's `include: ["#frontend"]` means: take only the models
and properties tagged `@scope("frontend")`. `auto-include-dependencies`
pulls in shared scalars / mixins those forms reference.

## Docs service config

```yaml
# services/docs/tspconfig.yaml
emit:
  - "@qninhdt/typespec-dbml"

options:
  "@qninhdt/typespec-dbml":
    output-dir: "../../../outputs/game-platform/docs/dbml"
    project-name: "game_platform"
    split-by-namespace: true
```

No filter on docs — the DBML output covers the whole schema for
review.

## Form metadata in action

```typespec
// contracts/collaboration/forms.tsp
namespace GamePlatform.Collaboration;

@scope("frontend")
@data
model CreateInvitationForm {
  @title("Invitee Email")
  @placeholder("friend@example.com")
  inviteeEmail: GamePlatform.Accounts.User.email;

  @title("Personal note")
  @inputType("textarea")
  note?: string;
}
```

`inviteeEmail` is a lookup type — it inherits the `@maxLength(320)`
and email format from `User.email`. Add `@maxLength(160)` to
`User.email` later, and every form using `User.email` updates
automatically.

## Generated Zod for that form

```ts
// outputs/game-platform/frontend/zod/src/game_platform/collaboration/CreateInvitationForm.ts
import { z } from "zod";

export const CreateInvitationFormSchema = z.object({
  inviteeEmail: z.email().max(320),
  note: z.string().optional(),
});

export type CreateInvitationForm = z.infer<typeof CreateInvitationFormSchema>;

export const CreateInvitationFormMeta = {
  inviteeEmail: {
    title: "Invitee Email",
    placeholder: "friend@example.com",
    inputType: "email",
  },
  note: {
    title: "Personal note",
    inputType: "textarea",
  },
} as const;
```

## Generated Ent for the same model

```go
// outputs/game-platform/backend/ent/ent/schema/badge.go
package schema

import (
  "entgo.io/ent"
  "entgo.io/ent/dialect/entsql"
  "entgo.io/ent/schema/edge"
  "entgo.io/ent/schema/field"
  entschema "entgo.io/ent/schema"
)

type Badge struct{ ent.Schema }

func (Badge) Annotations() []entschema.Annotation {
  return []entschema.Annotation{
    entsql.Annotation{Table: "badges"},
    entsql.WithComments(true),
  }
}

func (Badge) Mixin() []ent.Mixin { return []ent.Mixin{SoftDeletableEntity{}} }

func (Badge) Fields() []ent.Field {
  return []ent.Field{
    field.String("code").MaxLen(80).Unique(),
    field.String("label").MaxLen(160),
  }
}

func (Badge) Edges() []ent.Edge {
  return []ent.Edge{
    edge.To("users", User.Type).
      StorageKey(edge.Table("user_badges"), edge.Columns("badge_id", "user_id")),
  }
}
```

## Trying it locally

```sh
pnpm run compile-example:game-platform
pnpm run validate-examples:ent      # build the generated Go
pnpm run validate-examples:zod      # tsc the generated TS
```

## Takeaways

- **One schema** drove three different output trees.
- The frontend doesn't see `passwordHash`, `internalMetadata`, or any
  `@table`-only columns. It only sees what `@scope("frontend")` and
  `@data` opt into.
- Adding a column to a backend table doesn't accidentally leak it to
  the frontend.
- DBML gives a review surface for migrations without anyone hand-typing
  schema documentation.
