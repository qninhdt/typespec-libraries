# Quickstart

This walks you through generating Go (Ent), Python (SQLModel), TypeScript
(Zod), and DBML output from a single TypeSpec schema. About five minutes.

## 1. Install

You need [Node.js 20+](https://nodejs.org), pnpm, and the TypeSpec
compiler.

```sh
pnpm add -D \
  @typespec/compiler \
  @qninhdt/typespec-orm \
  @qninhdt/typespec-ent \
  @qninhdt/typespec-sqlmodel \
  @qninhdt/typespec-zod \
  @qninhdt/typespec-dbml
```

You only need the emitters you plan to run.

## 2. Author the schema

Create `main.tsp`:

```typespec
import "@qninhdt/typespec-orm";

using Qninhdt.Orm;

namespace Demo.Platform.Shared;

@tableMixin
model Timestamped {
  @key id: uuid;
  @autoCreateTime createdAt: utcDateTime;
  @autoUpdateTime updatedAt?: utcDateTime;
}

namespace Demo.Platform.Accounts;

@table
model User {
  ...Demo.Platform.Shared.Timestamped;

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
model Badge {
  ...Demo.Platform.Shared.Timestamped;

  @unique
  @maxLength(80)
  code: string;

  @manyToMany("user_badges")
  users?: User[];
}

namespace Demo.Platform.Forms;

@scope("frontend")
model CreateInvitationForm {
  @title("Invitee Email")
  @placeholder("friend@example.com")
  inviteeEmail: Demo.Platform.Accounts.User.email;
}
```

A few things to notice:

- `@tableMixin` declares a reusable fragment. It's never emitted as a
  standalone table, but every spreader inherits its columns.
- `@manyToMany("user_badges")` is symmetric — both sides opt in with
  the same join table name.
- `Demo.Platform.Accounts.User.email` is a **lookup type**. The
  `inviteeEmail` field reuses the same scalar plus its constraints.
- `@scope("frontend")` lets the Zod emitter pick this model up while
  Go and Python ignore it.

## 3. Configure emitters

Create `tspconfig.yaml`:

```yaml
emit:
  - "@qninhdt/typespec-ent"
  - "@qninhdt/typespec-sqlmodel"
  - "@qninhdt/typespec-zod"
  - "@qninhdt/typespec-dbml"

options:
  "@qninhdt/typespec-ent":
    output-dir: "./outputs/ent"
    standalone: true
    library-name: "github.com/acme/domain-models"
    collection-strategy: "jsonb"

  "@qninhdt/typespec-sqlmodel":
    output-dir: "./outputs/sqlmodel"
    standalone: true
    library-name: "acme-models"
    collection-strategy: "jsonb"

  "@qninhdt/typespec-zod":
    output-dir: "./outputs/zod"
    standalone: true
    library-name: "@acme/forms"
    include: ["#frontend"]

  "@qninhdt/typespec-dbml":
    output-dir: "./outputs/dbml"
    split-by-namespace: true
```

## 4. Compile

```sh
npx tsp compile .
```

You should see four output trees under `outputs/`:

```
outputs/
  ent/
    go.mod
    ent/schema/user.go
    ent/schema/badge.go
    ent/schema/timestamped.go
  sqlmodel/
    pyproject.toml
    demo/platform/accounts/user.py
    demo/platform/accounts/badge.py
    demo/platform/shared/timestamped.py
  zod/
    package.json
    src/demo/platform/forms/CreateInvitationForm.ts
  dbml/
    demo/platform/accounts.dbml
    demo/platform/shared.dbml
```

## 5. Use the output

- Drop `outputs/ent/` next to your Go service and run
  `go generate ./ent/...` to materialize Ent's runtime code.
- Add `outputs/sqlmodel/` to your Python project's `PYTHONPATH` (or
  `pip install -e .`).
- Publish `outputs/zod/` to your private npm registry, or symlink it
  into your frontend.
- Open `outputs/dbml/*.dbml` in [dbdiagram.io](https://dbdiagram.io) to
  preview the schema.

## What's next?

- Read [Core Concepts](/guide/concepts/namespaces) to understand the
  model.
- Browse [Reference / Decorators](/reference/decorators/) for every
  decorator in the library.
- See real schemas in [Examples](/examples/).
