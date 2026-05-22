# Form metadata

Form metadata is how you attach UI hints — labels, placeholders,
HTML input types — directly to your TypeSpec schema. The Zod emitter
exports them as `*Meta` objects; SQLModel and Ent surface them as
field tags / annotations.

## The decorators

| Decorator             | Target               | Purpose                          |
| --------------------- | -------------------- | -------------------------------- |
| `@title("text")`      | model property       | Human-readable label             |
| `@placeholder("...")` | model property       | Placeholder hint                 |
| `@inputType("text")`  | scalar (or via `@@`) | HTML input type override         |
| `@data`               | model                | Marks a default form / DTO model |

```typespec
@scope("frontend")
@data
model CreateInvitationForm {
  @title("Invitee Email")
  @placeholder("friend@example.com")
  inviteeEmail: Demo.Platform.Accounts.User.email;
}
```

## `@data` vs `@table`

`@data` marks a model as a **DTO / form** — not a table. Form emitters
(Zod) write it; persistence emitters (Ent, SQLModel) skip it (or treat
it as a Pydantic / Go DTO struct).

A model in a namespace without `@data` or `@table` is treated as a
default form model — Zod emits it, persistence emitters ignore it.

## Lookup-type reuse

Form metadata composes with **lookup types**: referencing a property
via `Model.field` reuses the scalar plus its constraints.

```typespec
@table
model User {
  @key id: uuid;
  @unique @maxLength(320) @format("email") email: string;
}

@scope("frontend")
@data
model SignInForm {
  @title("Email")
  email: User.email;          // inherits maxLength + email format
  @title("Password")
  @inputType("password")
  password: string;
}
```

The Zod emitter generates:

```ts
export const SignInFormSchema = z.object({
  email: z.email().max(320),
  password: z.string(),
});
export type SignInForm = z.infer<typeof SignInFormSchema>;

export const SignInFormMeta = {
  email: { title: "Email" },
  password: { title: "Password", inputType: "password" },
} as const;
```

## `@inputType`

`@inputType` overrides the HTML input type. By default the emitter
picks the type from the scalar:

| Scalar            | Default `inputType` |
| ----------------- | ------------------- |
| `string`          | `"text"`            |
| `email`           | `"email"`           |
| `int32` / `int64` | `"number"`          |
| `boolean`         | `"checkbox"`        |
| `utcDateTime`     | `"datetime-local"`  |
| `plainDate`       | `"date"`            |
| `plainTime`       | `"time"`            |

Override for cases like passwords, multi-line text, or color pickers:

```typespec
@inputType("password") password: string;
@inputType("textarea") biography: string;
@inputType("color") accentColor: string;
```

`@inputType` targets a scalar. To override the input type for a
lookup-type field without modifying the source scalar, use
`@@inputType`:

```typespec
@@inputType(SignInForm.password::type, "password");
```

## How it surfaces per emitter

### Zod

Each form model emits three exports:

- `<Model>Schema` — the Zod schema.
- `<Model>` — `z.infer<typeof <Model>Schema>` type.
- `<Model>Meta` — a `const` object keyed by property name with `title`,
  `placeholder`, and `inputType` fields.

### SQLModel

`@data` models are emitted as Pydantic `BaseModel` classes. `@title`
and `@placeholder` become field metadata via `Field(title=..., schema_extra=...)`.

### Ent

`@data` models are emitted as Go structs with form-tag annotations.
Persisted `@table` models can also carry form metadata for
admin-style UIs; it surfaces as struct tags.

## Diagnostics

- The library doesn't error on missing form metadata — `@title` is
  always optional.
- Inferred input types are surfaced as soon as the property has any
  scalar — you don't have to add `@inputType` to every field.

Next: the full table of [Custom scalars](/guide/custom-scalars).
