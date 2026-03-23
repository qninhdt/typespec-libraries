# Feature Proposal And Examples

This document turns the current repository analysis into a practical feature roadmap.

It covers:

- features explicitly requested in `todo.txt`
- production-ready gaps for each package
- nice-to-have features that would improve developer experience after the core roadmap is done

## Priority Legend

- Must-have: should be implemented before calling the package production-ready
- Nice-to-have: useful, but can land after the core production gaps are closed

## Features Requested In `todo.txt`

### 1. Namespace-aware output grouping

Priority: Must-have

Why this matters:

- large schemas become hard to manage when every generated file lands in one flat folder
- package names, Python modules, and Zod export trees should reflect domain boundaries
- this is the cleanest way to scale the library from toy examples to real multi-domain systems

Proposed behavior:

- use TypeSpec `namespace` directly to decide output subfolders
- do not inject a default `models` folder anywhere
- if a team wants a `models` folder, they must express it in the namespace, for example `namespace App.Models.Identity`
- package names, Python modules, and Zod source folders are all derived from the namespace
- keep naming rules consistent across emitters

TypeSpec example:

```tsp
namespace App.Identity;

@table
model User {
  @key id: uuid;
  @unique email: string;
}

@data
model CreateUserForm {
  email: string;
  password: string;
}

namespace App.Billing;

@table
model Invoice {
  @key id: uuid;
  total: decimal;
}

@data
model CreateInvoiceForm {
  total: decimal;
}
```

Expected output example:

```text
outputs/gorm/app/identity/user.go
outputs/gorm/app/billing/invoice.go

outputs/sqlmodel/app/identity/user.py
outputs/sqlmodel/app/billing/invoice.py

outputs/zod/src/app/identity/CreateUserForm.ts
outputs/zod/src/app/billing/CreateInvoiceForm.ts
```

If a team wants an explicit `models` folder, it comes from the namespace:

```tsp
namespace App.Models.Identity;

@table
model User {
  @key id: uuid;
  @unique email: string;
}

@data
model CreateUserForm {
  email: string;
}
```

Expected output:

```text
outputs/gorm/app/models/identity/user.go
outputs/sqlmodel/app/models/identity/user.py
outputs/zod/src/app/models/identity/CreateUserForm.ts
```

Notes:

- GORM package names are derived from the last namespace segment, for example `identity`
- SQLModel emits nested Python packages with `__init__.py`
- Zod emits nested folders plus a root `index.ts` barrel for emitted `@data` models
- if a model has no namespace, it can be emitted at the root of the language output
- DBML can either split per namespace or keep one file with namespace sections

### 2. Output folder structure cleanup

Priority: Must-have

Why this matters:

- the current output layout is emitter-driven rather than product-driven
- generated artifacts should be easy to inspect, build, and publish without knowing internal emitter names
- the folder structure should match what downstream Go, Python, and TypeScript tools expect

Suggested target structure:

```text
outputs/
  gorm/
    go.mod
    app/
      identity/
      billing/
  sqlmodel/
    pyproject.toml
    app/
      identity/
      billing/
  zod/
    package.json
    src/
      app/
        identity/
        billing/
  dbml/
    schema.dbml
```

TypeSpec config example:

```yaml
options:
  "@qninhdt/typespec-gorm":
    output-dir: "./outputs/gorm"
  "@qninhdt/typespec-sqlmodel":
    output-dir: "./outputs/sqlmodel"
  "@qninhdt/typespec-zod":
    output-dir: "./outputs/zod"
  "@qninhdt/typespec-dbml":
    output-dir: "./outputs/dbml"
```

Recommended rules:

- standalone mode should generate a self-contained library inside its own emitter folder
- namespace alone determines internal folders
- there is no emitter-created `models` folder by default
- non-standalone mode should not write surprise package manifests unless explicitly requested
- library metadata naming should use `library-name`, while code folders still come from namespace
- namespace grouping and output layout should compose cleanly

### 3. Config-driven export filtering

Priority: Must-have

Why this matters:

- users often want one TypeSpec project to feed multiple emitters without forcing every model into every language package
- per-model language decorators add noise, create maintenance overhead, and do not scale well as more emitters are added
- filtering should stay predictable and work with the namespace-first design

Proposed behavior:

- filtering is configured per emitter, not on each model
- filtering uses two selector lists: `include` and `exclude`
- each selector can target a namespace subtree or one concrete model
- `App` means everything inside `App`
- `App.Forms` means everything inside `App.Forms`
- `App.Forms.CreateTodo` means only that specific table or data model
- emitters should skip filtered models before writing files or building relation metadata

Config example:

```yaml
options:
  "@qninhdt/typespec-gorm":
    include:
      - "App.Domain"
    exclude:
      - "App.Domain.Internal"

  "@qninhdt/typespec-zod":
    library-name: "@acme/forms"
    include:
      - "App.Forms"
      - "App.Shared.Forms"
    exclude:
      - "App.Forms.Legacy"
      - "App.Shared.Forms.InternalDebugForm"
```

TypeSpec example:

```tsp
namespace App.Domain;

@table
model User {
  @key id: uuid;
  email: string;
}

namespace App.Forms;

@data
model CreateUserForm {
  email: string;
}
```

Expected result:

- GORM emits `App.Domain.User`
- Zod emits `App.Forms.CreateUserForm`
- `App.Domain.User` is not written into the Zod package even if the emitter could technically ignore `@table`

Validation rules:

- warn if one selector is redundant because a broader selector already covers it
- warn if the same path appears in both `include` and `exclude`
- when `include` and `exclude` overlap, `exclude` wins, but the overlap should still be reported
- support both namespace-level and model-level filtering with the same matching rules
- if a selected model depends on a filtered-out model in a way the emitter cannot represent, emit a clear diagnostic
- relation diagnostics should explain when a target model was excluded by filter settings
- defaults should remain simple: if no filter is configured, emitters use their normal model-kind rules

### 4. Cross-namespace dependency filtering rules

Priority: Must-have

Why this matters:

- namespace filtering becomes unsafe if dependencies are silently dropped
- large systems often keep tables, enums, aliases, mixins, and forms in different namespaces
- users need predictable behavior when an included model points at something outside the selected set

Proposed behavior:

- filtering should be evaluated on the full normalized model graph, not file-by-file
- emitters must validate referenced models, enums, aliases, and mixins before emission starts
- if a required dependency is filtered out, the compiler should fail with a targeted diagnostic instead of emitting partial code

Example:

```tsp
namespace App.Shared;

@tableMixin
model AuditFields {
  createdAt: utcDateTime;
}

namespace App.Domain;

@table
model User is App.Shared.AuditFields {
  @key id: uuid;
  role: App.Security.UserRole;
}

namespace App.Security;

enum UserRole {
  admin,
  member,
}
```

If the emitter config only includes `App.Domain`, it should not silently emit a broken `User` model.

Validation rules:

- if a selected model uses a filtered-out mixin, emit an error
- if a selected model uses a filtered-out enum or scalar alias, emit an error unless the emitter can inline it safely
- if a selected relation points to a filtered-out table, emit an error with the relation name and target model
- if a selector includes a specific model but excludes one of its required dependencies, explain that the filter configuration is inconsistent
- diagnostics should mention both the selected model and the excluded dependency so the fix is obvious

### 5. Strict unsupported-feature policy

Priority: Must-have

Why this matters:

- silent fallbacks create code that compiles but is not safe in production
- unsupported persistence behavior should be visible at generation time, not discovered later in runtime or schema review
- clear limits make it easier to trust the emitters

Proposed behavior:

- emitters should default to failing on unsupported persistence or packaging features
- any fallback mode should be explicit and opt-in
- diagnostics should explain what feature is unsupported and what workaround is recommended

Examples:

- GORM should not silently emit `interface{}` for a structured field that has no storage strategy
- SQLModel should not emit a plain `list[...]` field for a persisted array unless a concrete SQL strategy exists
- DBML should not skip a constraint or index without warning
- Zod should not silently omit metadata options that the package claims to support

Suggested diagnostics:

- `unsupported-persistence-type`
- `unsupported-relation-shape`
- `unsupported-namespace-filter-dependency`
- `unsupported-emitter-option`

### 6. Shared model normalization pipeline

Priority: Must-have

Why this matters:

- namespace mapping, filtering, relation validation, and mixin expansion should not be reimplemented differently in each emitter
- duplicated logic is the fastest way for GORM, SQLModel, DBML, and Zod to drift apart
- a shared normalization step makes diagnostics and future features much easier to maintain
- this is the right time to refactor the codebase around one normalized form instead of growing more emitter-specific branches

Proposed behavior:

- build one normalized intermediate model from TypeSpec before emitter-specific rendering
- resolve namespace-derived paths, selector matching, mixin expansion, relation metadata, foreign-key targets, and filter decisions in that shared layer
- emitters consume the normalized graph and focus only on language-specific code generation
- existing emitter code should be refactored to depend on that normalized form rather than duplicating schema interpretation

Example normalized shape:

```text
NormalizedModel
  name: User
  namespace: App.Identity
  outputPath: app/identity/user
  kind: table
  fields:
    - id
    - email
  relations:
    - organization -> organizations.code
  mixins:
    - Timestamped
```

Expected benefits:

- one place to validate namespace filtering and dependency rules
- one place to detect redundant or conflicting `include` / `exclude` selectors
- one place to apply `@tableMixin`
- one place to compute file paths for GORM, SQLModel, Zod, and DBML
- fewer emitter-specific bugs caused by mismatched interpretation of the same schema

### 7. Emitter support matrix

Priority: Must-have

Why this matters:

- users need to know which features are production-ready per emitter
- maintainers need a clear contract for what regressions matter
- support gaps are easier to prioritize when they are visible in one place

Suggested matrix:

```text
Feature                         ORM   GORM   SQLModel   DBML   Zod
@table                          yes   yes    yes        yes    n/a
@data                           yes   n/a    n/a        n/a    yes
namespace-based folders         yes   yes    yes        partial yes
table mixins                    planned planned planned planned n/a
non-id foreign keys             planned planned planned planned n/a
many-to-many shorthand          planned planned planned partial n/a
standalone packaging            n/a   partial partial   n/a    partial
```

Recommended rules:

- keep the matrix in the main README or package docs
- mark features as `yes`, `partial`, `planned`, or `unsupported`
- update the matrix whenever a proposal in this roadmap is completed

### 8. `@tableMixin`

Priority: Must-have

Why this matters:

- common table fields like `id`, `createdAt`, `updatedAt`, `deletedAt`, tenant keys, and audit columns are repeated in real systems
- the current examples still need a workaround because inheritance is not fully supported yet
- SQLModel and GORM need different generation strategies even when the TypeSpec author writes one shared model

Proposed behavior:

- add a new decorator `@tableMixin` on a model that is reusable by table models
- a mixin is not emitted as a table by itself
- mixin fields participate in validation, constraints, and relation resolution

TypeSpec example:

```tsp
@tableMixin
model Timestamped {
  @key id: uuid;
  @autoCreateTime createdAt: utcDateTime;
  @autoUpdateTime updatedAt?: utcDateTime;
  @softDelete deletedAt?: utcDateTime;
}

@table
model User is Timestamped {
  @unique email: string;
  displayName: string;
}
```

Expected GORM output:

```go
type User struct {
    ID          uuid.UUID      `gorm:"column:id;type:uuid;primaryKey"`
    CreatedAt   time.Time      `gorm:"column:created_at;autoCreateTime"`
    UpdatedAt   *time.Time     `gorm:"column:updated_at;autoUpdateTime"`
    DeletedAt   gorm.DeletedAt `gorm:"column:deleted_at;index"`
    Email       string         `gorm:"column:email;uniqueIndex"`
    DisplayName string         `gorm:"column:display_name"`
}
```

Expected SQLModel output:

```python
class Timestamped:
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    created_at: datetime = Field(sa_column=Column(DateTime(timezone=True), server_default=func.now()))
    updated_at: datetime | None = Field(default=None, sa_column=Column(DateTime(timezone=True), onupdate=func.now()))
    deleted_at: datetime | None = Field(default=None, index=True)


class User(Timestamped, SQLModel, table=True):
    __tablename__ = "users"

    email: str = Field(unique=True)
    display_name: str
```

Recommended validation rules:

- child models can override mixin fields only with an explicit override rule
- conflicting primary keys should be an error
- mixin-to-mixin inheritance should be allowed, but cycles should be rejected

## Cross-cutting Production Features

### 9. Generated artifact verification

Priority: Must-have

Why this matters:

- build and unit tests for the TypeScript workspace are not enough
- the repository emits Go, Python, TypeScript, and DBML artifacts, so those outputs should be verified too

Suggested CI commands:

```bash
pnpm run compile-examples:gorm
go build ./outputs/gorm/...

pnpm run compile-examples:sqlmodel
python -m compileall outputs/sqlmodel

pnpm run compile-examples:zod
pnpm --dir outputs/zod exec tsc -p tsconfig.json
```

What this protects against:

- broken imports
- invalid standalone package layouts
- generated syntax errors
- emitter regressions that unit tests missed

### 10. Golden output regression tests

Priority: Must-have

Why this matters:

- examples are already close to a contract suite
- if a feature changes output shape, the repo should make that diff obvious

Suggested approach:

- compile `examples/main.tsp`
- snapshot the generated outputs for each emitter
- fail CI when output changes unexpectedly

Example:

```text
examples/main.tsp
  -> expected/gorm/
  -> expected/sqlmodel/
  -> expected/zod/
  -> expected/dbml/
```

This is especially valuable for:

- relation tags
- enum generation
- namespace-driven folder layout
- mixin expansion

## `@qninhdt/typespec-orm`

### 11. Explicit referenced-column support

Priority: Must-have

Why this matters:

- real schemas often reference natural keys or non-`id` primary keys
- the current relation model assumes the target column is always `id`

Proposed API:

- extend `@foreignKey` to support two parameters
- shape: `@foreignKey("localColumn", "targetColumn")`
- if the second parameter is omitted, it still defaults to `"id"`

TypeSpec example:

```tsp
@table
model Organization {
  @key code: string;
  name: string;
}

@table
model User {
  organizationCode: string;

  @foreignKey("organizationCode", "code")
  organization: Organization;
}
```

Expected generated relation:

- GORM FK points to `organizations.code`
- SQLModel emits `ForeignKey("organizations.code")`
- DBML emits `Ref: users.organization_code > organizations.code`

### 12. Stronger relation diagnostics

Priority: Must-have

Why this matters:

- invalid relations should fail fast at compile time
- production users should not discover a broken relation by reading emitted code

Diagnostics that should exist:

- `@mappedBy("x")` points to a missing property
- `@foreignKey("local", "target")` points to a local column that does not exist
- `@foreignKey("local", "target")` points to a target column that does not exist
- local and target FK column types are incompatible
- `SET NULL` is used on a non-nullable local FK field
- one-to-one relations are missing a uniqueness guarantee on the local FK

Invalid example:

```tsp
@table
model Post {
  @key id: uuid;

  @foreignKey("authorId", "code")
  author: User;
}

@table
model User {
  @key id: uuid;
}
```

Expected compiler error:

```text
@foreignKey("authorId", "code") on "author" is invalid because "User.code" does not exist.
```

### 13. Named constraints and check constraints

Priority: Must-have

Why this matters:

- production databases need stable, readable constraint names
- business rules often need database-level checks, not just app validation

Proposed API:

```tsp
@table
model Wallet {
  @key id: uuid;

  @check("credits_non_negative", "credits >= 0")
  credits: int32;
}
```

Expected generated output:

- GORM: a `check:` tag or migration helper entry
- SQLModel: `CheckConstraint("credits >= 0", name="credits_non_negative")`
- DBML: a named check entry or at minimum a preserved note

### 14. Many-to-many shorthand

Priority: Nice-to-have

Why this matters:

- explicit join models are correct, but verbose for common cases
- many projects want the join table generated automatically

Proposed API:

```tsp
@table
model User {
  @key id: uuid;

  @manyToMany("user_roles")
  roles: Role[];
}

@table
model Role {
  @key id: uuid;

  @manyToMany("user_roles")
  users: User[];
}
```

Expected behavior:

- generate a `user_roles` join table automatically
- allow opting out for teams that want an explicit join model

Required error handling:

- both sides must be arrays of `@table` models, otherwise emit a compile-time error
- both sides must agree on the same join table name, otherwise emit a compile-time error
- if only one side declares `@manyToMany`, emit a compile-time error instead of guessing the inverse side
- if a team needs payload columns on the join table, shorthand must fail with a diagnostic telling them to use an explicit junction model
- if an explicit `UserRole` table already exists and conflicts with the shorthand-generated join table, emit a compile-time error

## `@qninhdt/typespec-gorm`

### 15. Stable standalone Go library layout

Priority: Must-have

Why this matters:

- standalone output should always build, with folder names derived from namespace rather than emitter-specific naming options
- teams should be able to publish or vendor the generated module directly

Config example:

```yaml
options:
  "@qninhdt/typespec-gorm":
    standalone: true
    library-name: "github.com/acme/domain-models"
```

Expected output:

```text
outputs/gorm/
  go.mod
  app/
    identity/
      user.go
    billing/
      invoice.go
```

Expected import:

```go
import "github.com/acme/domain-models/app/identity"
```

Rules:

- there is no `package-name` option
- Go package names are derived from the final namespace segment
- if a team wants `models` in the path, they use a namespace such as `App.Models.Identity`

### 16. Supported strategy for complex and collection types

Priority: Must-have

Why this matters:

- production code should not silently fall back to `interface{}`
- arrays, JSON documents, and richer collections need explicit storage behavior

TypeSpec example:

```tsp
@table
model StoryNode {
  @key id: uuid;
  pool: jsonb;
  tags: string[];
}
```

Possible config:

```yaml
options:
  "@qninhdt/typespec-gorm":
    collection-strategy: "jsonb"
```

Expected output example:

```go
type StoryNode struct {
    ID   uuid.UUID                `gorm:"column:id;primaryKey"`
    Pool datatypes.JSON           `gorm:"column:pool;type:jsonb"`
    Tags datatypes.JSONSlice[string] `gorm:"column:tags;type:jsonb"`
}
```

Alternative strategies worth supporting:

- PostgreSQL arrays
- JSONB collections
- explicit `unsupported-type` error mode

### 17. Optional custom tag profiles

Priority: Nice-to-have

Why this matters:

- different Go stacks want different tags
- some teams want `validate`, some want `binding`, some want only `json`

Config example:

```yaml
options:
  "@qninhdt/typespec-gorm":
    tag-profiles:
      - json
      - validate
      - form
```

Expected output:

```go
Email string `json:"email" validate:"required,email" form:"email"`
```

## `@qninhdt/typespec-sqlmodel`

### 18. Stable standalone Python library layout

Priority: Must-have

Why this matters:

- standalone output should produce a real publishable Python package
- package layout should match Python import expectations, not just emitter internals

Config example:

```yaml
options:
  "@qninhdt/typespec-sqlmodel":
    standalone: true
    library-name: "acme-models"
```

Expected output:

```text
outputs/sqlmodel/
  pyproject.toml
  app/
    __init__.py
    identity/
      user.py
    billing/
      invoice.py
```

Expected import:

```python
from app.identity.user import User
```

Rules:

- there is no `module-name` option
- Python package folders are derived from namespace
- `library-name` is used for package metadata, not for inventing internal folder names
- if a team wants `models` in the import path, they use a namespace such as `App.Models.Identity`

### 19. Real persistence strategy for arrays and structured fields

Priority: Must-have

Why this matters:

- `list[...]` type hints alone are not enough for reliable SQL persistence
- SQLAlchemy needs explicit column types for arrays or JSON-backed collections

TypeSpec example:

```tsp
@table
model UserPreferences {
  @key id: uuid;
  tags: string[];
  settings: jsonb;
}
```

Expected output example:

```python
class UserPreferences(SQLModel, table=True):
    __tablename__ = "user_preferences"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    tags: list[str] = Field(sa_column=Column(ARRAY(String), nullable=False))
    settings: dict[str, Any] = Field(sa_column=Column(JSONB, nullable=False))
```

Possible strategies:

- `ARRAY(String)` for PostgreSQL
- `JSONB` for list fields when configured
- hard error when no storage strategy is configured

### 20. Alembic-oriented metadata helpers

Priority: Nice-to-have

Why this matters:

- SQLModel users often adopt Alembic immediately
- generated packages are more useful if they expose the right import surface for migrations

Expected additions:

```python
from sqlmodel import SQLModel

metadata = SQLModel.metadata
```

This could live in the package root:

```python
from .identity.user import User
from .billing.invoice import Invoice

metadata = SQLModel.metadata
```

## `@qninhdt/typespec-dbml`

### 21. Lookup-type columns must be emitted correctly

Priority: Must-have

Why this matters:

- lookup types are already part of the ORM story
- DBML should not silently drop inherited scalar fields

TypeSpec example:

```tsp
@table
model Invitation {
  @key id: uuid;
  inviteeEmail: User.email;
  worldName: World.name;
}
```

Expected DBML:

```dbml
Table invitations {
  id uuid [pk, not null]
  invitee_email varchar(320) [not null]
  world_name varchar(200) [not null]
}
```

### 22. Enum indexes and uniques must be preserved

Priority: Must-have

Why this matters:

- enum columns are often indexed in real schemas
- DBML should reflect the same indexing story as GORM and SQLModel

TypeSpec example:

```tsp
enum SubscriptionPlan {
  free: "free",
  premium: "premium",
}

@table
model Subscription {
  @key id: uuid;
  @index plan: SubscriptionPlan;
}
```

Expected DBML:

```dbml
Table subscriptions {
  id uuid [pk, not null]
  plan SubscriptionPlan

  indexes {
    plan
  }
}
```

### 23. Foreign-key actions in DBML

Priority: Must-have

Why this matters:

- cascade rules are part of schema design, not just ORM codegen
- DBML output should not lose `onDelete` and `onUpdate` intent

TypeSpec example:

```tsp
@table
model Post {
  @key id: uuid;

  authorId: uuid;

  @foreignKey("authorId")
  @onDelete("CASCADE")
  @onUpdate("CASCADE")
  author: User;
}
```

Expected DBML:

```dbml
Ref: posts.author_id > users.id [delete: CASCADE, update: CASCADE]
```

### 24. Namespace-based DBML splitting

Priority: Nice-to-have

Why this matters:

- very large systems benefit from multiple DBML files
- namespace-aware DBML generation makes architecture boundaries clearer

Expected output:

```text
outputs/dbml/identity.dbml
outputs/dbml/billing.dbml
```

## `@qninhdt/typespec-zod`

### 25. Simplified Zod library layout and configuration

Priority: Must-have

Why this matters:

- Zod output should follow the same namespace rules as the other emitters
- the naming and folder story should be simple enough that users do not need to learn emitter-specific path options
- package metadata and code layout should be separate concerns

Proposed configuration:

- keep `library-name` as the one package-level naming option
- generate folders inside `src/` directly from namespace
- do not inject a default `models` folder
- there is no `package-name` option
- there is no `filename` option

Config example:

```yaml
options:
  "@qninhdt/typespec-zod":
    library-name: "@acme/forms"
```

TypeSpec example:

```tsp
namespace App.Forms;

@data
model CreateInvitationForm {
  inviteeEmail: string;
}
```

Expected output:

```text
outputs/zod/
  package.json
  src/
    app/
      forms/
        CreateInvitationForm.ts
```

If a team wants a `models` folder, that must come from namespace:

```tsp
namespace App.Models.Forms;
```

Expected output:

```text
outputs/zod/src/app/models/forms/CreateInvitationForm.ts
```

### 26. Stable emission without post-write file patching

Priority: Must-have

Why this matters:

- generated files should be produced in one deterministic render pass
- post-write mutations make diagnostics, caching, and testing harder

Expected behavior:

- schema declaration
- inferred type export
- barrel exports
- package metadata

All should be emitted from the normal Alloy output tree.

Expected file:

```ts
import { z } from "zod";

export const CreateInvitationFormSchema = z.object({
  inviteeEmail: z.string().email(),
});

export type CreateInvitationForm = z.infer<typeof CreateInvitationFormSchema>;
```

### 27. Rich form metadata export

Priority: Nice-to-have

Why this matters:

- `@title`, `@placeholder`, and `@@inputType` are already useful for forms
- frontend teams often want both validation and field metadata from the same generator

TypeSpec example:

```tsp
@data
model CreateInvitationForm {
  @title("Invitee Email")
  @placeholder("friend@example.com")
  inviteeEmail: User.email;
}
```

Expected output example:

```ts
export const CreateInvitationFormSchema = z.object({
  inviteeEmail: z.string().email(),
});

export const CreateInvitationFormMeta = {
  inviteeEmail: {
    title: "Invitee Email",
    placeholder: "friend@example.com",
    inputType: "email",
  },
};
```

## Recommended Implementation Order

### Phase 1

- namespace-aware output grouping
- output folder cleanup
- config-driven export filtering
- cross-namespace dependency filtering rules
- strict unsupported-feature policy
- shared model normalization pipeline
- emitter support matrix
- `@tableMixin`
- DBML lookup-type fixes
- simplified Zod namespace-based layout
- generated artifact verification

### Phase 2

- explicit referenced-column support
- stronger relation diagnostics
- golden output regression tests
- stable standalone packaging for GORM and SQLModel
- complex/collection persistence strategies for GORM and SQLModel
- DBML FK action emission

### Phase 3

- named constraints and check constraints
- many-to-many shorthand
- Zod form metadata export
- Alembic helpers
- namespace-split DBML output

## Short Summary

If the goal is a production-ready `v1`, the highest-leverage work is:

1. make output layout and namespaces scale to real projects
2. make filtering safe by validating excluded dependencies across namespaces
3. add a strict unsupported-feature policy so emitters fail loudly instead of degrading silently
4. add a shared normalization pipeline so all emitters interpret the schema the same way
5. add `@tableMixin` so reusable base models become first-class
6. remove correctness gaps in DBML and Zod
7. harden GORM and SQLModel standalone output and type-mapping behavior
8. validate generated Go, Python, and TypeScript artifacts in CI
