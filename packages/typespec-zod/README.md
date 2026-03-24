# @qninhdt/typespec-zod

TypeSpec emitter that generates namespace-grouped Zod schemas from `@data` models.

This emitter is intentionally focused on form and DTO shapes. It follows the same namespace and selector rules as the ORM-backed emitters, but it does not emit `@table` models.

## What This Emitter Is For

Use this emitter when you want:

- Zod schemas generated from TypeSpec `@data`
- inferred TypeScript types beside the schemas
- stable namespace-derived output layout
- rich field metadata for frontend forms

## Installation

```sh
pnpm add -D \
  @typespec/compiler \
  @typespec/emitter-framework \
  @alloy-js/core \
  @alloy-js/typescript \
  @qninhdt/typespec-orm \
  @qninhdt/typespec-zod \
  zod
```

## Runtime Expectations

Generated Zod output is intended to drop into TypeScript projects cleanly.

- standalone mode writes `package.json`, `tsconfig.json`, and `src/index.ts`
- generated code targets ESM-style package output
- runtime validation depends on `zod`
- inferred types are emitted in the same pass as the schemas, so no post-processing step is required

## Configuration Reference

```yaml
emit:
  - "@qninhdt/typespec-zod"

options:
  "@qninhdt/typespec-zod":
    output-dir: "./outputs/zod"
    standalone: true
    library-name: "@acme/forms"
    include:
      - "Demo.Platform.Forms"
```

Supported options:

| Option         | Type       | Meaning                                           |
| -------------- | ---------- | ------------------------------------------------- |
| `output-dir`   | `string`   | target directory handled by the TypeSpec compiler |
| `standalone`   | `boolean`  | write package metadata and emit under `src/`      |
| `library-name` | `string`   | package name for standalone output                |
| `include`      | `string[]` | namespace or declaration selectors to keep        |
| `exclude`      | `string[]` | namespace or declaration selectors to drop        |

Not supported:

- `filename`
- `package-name`
- legacy post-write alias patching

## Selector Behavior

Zod uses the same selector behavior as the ORM-backed emitters.

Examples:

```yaml
include:
  - "Demo.GamePlatform.Forms"
exclude:
  - "Demo.GamePlatform.Forms.Internal"
```

Behavior:

- selectors are dotted names, not glob patterns
- `exclude` wins over `include`
- excluding a dependency required by a selected `@data` model fails emission

## Output Layout

Given:

```typescript
namespace App.Forms.Public;
```

Standalone output looks like:

```text
outputs/zod/
  package.json
  tsconfig.json
  src/
    app/
      forms/
        public/
          CreateInvitationForm.ts
    index.ts
```

Non-standalone mode writes directly under the namespace folders and skips package metadata files.

## Generated Package Contract

For each emitted `@data` model, the emitter writes:

- a `ModelSchema`
- `type Model = z.infer<typeof ModelSchema>`
- `ModelMeta` when field metadata is available

Standalone output also writes:

- `package.json`
- `tsconfig.json`
- a root `src/index.ts` barrel that re-exports every generated data model

This means consumers can either import from the root barrel or from specific namespace paths.

## Schema Example

```typescript
import "@qninhdt/typespec-orm";

using Qninhdt.Orm;

namespace Demo.Accounts;

@table
model User {
  @key id: uuid;

  @maxLength(320)
  @format("email")
  email: string;

  @maxLength(100)
  displayName: string;
}

namespace Demo.Forms;

@data("Create Invitation Form")
model CreateInvitationForm {
  @title("Invitee Email")
  @placeholder("friend@example.com")
  inviteeEmail: Demo.Accounts.User.email;

  @title("Message")
  message?: text;
}

@@inputType(CreateInvitationForm.message::type, "textarea");
```

## Generated Behavior

For each `@data` model, the emitter generates:

- `ModelSchema`
- `type Model = z.infer<typeof ModelSchema>`
- optional `ModelMeta`

Example shape:

```ts
import { z } from "zod";

export const CreateInvitationFormSchema = z.object({
  inviteeEmail: z.string().max(320).email(),
  message: z.string().optional(),
});

export type CreateInvitationForm = z.infer<typeof CreateInvitationFormSchema>;

export const CreateInvitationFormMeta = {
  inviteeEmail: {
    title: "Invitee Email",
    placeholder: "friend@example.com",
    inputType: "email",
  },
  message: {
    title: "Message",
    inputType: "textarea",
  },
} as const;
```

## Form Metadata

The metadata export is built from:

- `@title`
- `@placeholder`
- `@@inputType`
- inferred input type from some formats such as `email` and `url`

This gives frontend teams a single generated source for both validation and display hints.

## Lookup Types And Constraint Inheritance

Zod generation works especially well with lookup types:

```typescript
@data
model PublicUser {
  email: Demo.GamePlatform.Accounts.User.email;
}
```

That pattern lets a form or DTO model inherit scalar constraints from the source property, such as:

- string length bounds
- format-derived validators like `email` and `url`
- titles and placeholders when modeled on the `@data` field

If the public shape should diverge from the persistence model, define a dedicated `@data` property explicitly instead of chaining more lookup reuse.

## Frontend Integration Pattern

The intended usage pattern is:

1. model public-facing input shapes as `@data`
2. reuse field constraints with lookup types where it helps
3. generate Zod output
4. import `ModelSchema`, `Model`, and `ModelMeta` in the frontend

That keeps validation, TypeScript inference, and form hints sourced from one schema without forcing frontend code to consume table models directly.

## Supported Features

- namespace-first layout
- standalone package scaffolding via `library-name`
- root `index.ts` barrel
- lookup-type constraint inheritance
- inferred TypeScript aliases emitted in the same render pass
- form metadata export
- shared filtering with `include` and `exclude`

## Important Boundaries

- only `@data` models are emitted
- relation-heavy `@table` models are not the target of this emitter
- if a `@data` model references a shape that cannot be represented cleanly as Zod output, fix the source schema instead of expecting silent fallback behavior

## Common Diagnostics And Gotchas

- `standalone-requires-library-name`
  Standalone package generation requires `library-name`.
- filtered dependency failures
  A selected `@data` model still needs every required dependency included by the selector set.
- table-only shapes leaking into forms
  If a public form model starts to mirror a full persistence model, prefer writing an explicit `@data` model rather than reusing relation-heavy table shapes directly.

Practical guidance:

- keep `@data` models intentionally public-facing
- use lookup types for individual fields more often than for whole object graphs
- treat the root barrel as a convenience export, not a forced import style

## Verification

The repo verifies generated Zod output with:

```sh
pnpm run compile-examples
pnpm --dir outputs/zod exec tsc -p tsconfig.json
```

## Related Docs

- [`README.md`](/home/qninh/projects/typespec-libraries/README.md)
- [`packages/typespec-orm/README.md`](/home/qninh/projects/typespec-libraries/packages/typespec-orm/README.md)

---

Made with heart by @qninhdt, with GPT-5.4 and Claude Opus 4.6.
