# Form metadata

Decorators that surface UI hints in generated code. See the
[Form metadata guide](/guide/form-metadata) for the conceptual
overview.

## `@title(text: string)`

**Target:** property

Human-readable label for the field, intended for form labels and
admin UIs.

```typespec
@scope("frontend") @data
model SignInForm {
  @title("Email Address")
  email: string;
  @title("Password")
  password: string;
}
```

The Zod emitter writes it into the `*Meta` export:

```ts
export const SignInFormMeta = {
  email: { title: "Email Address" },
  password: { title: "Password" },
} as const;
```

SQLModel surfaces it as `Field(title=...)`. Ent surfaces it as a
form-tag annotation.

## `@placeholder(text: string)`

**Target:** property

Placeholder text for input elements.

```typespec
@title("Email")
@placeholder("you@example.com")
email: string;
```

## `@inputType(htmlType: string)`

**Target:** scalar (or via `@@` augment for property-level overrides)

Overrides the HTML input type. By default, the emitter picks the type
from the scalar (string → `text`, email → `email`, int32 → `number`,
boolean → `checkbox`, etc.).

```typespec
@inputType("password")
scalar Password extends string;

@inputType("textarea")
scalar Biography extends string;

@scope("frontend") @data
model UserForm {
  password: Password;
  bio: Biography;
}
```

For property-level overrides without modifying the scalar, use the
augment form:

```typespec
@@inputType(SignInForm.password::type, "password");
```

Common values: `text`, `email`, `password`, `number`, `tel`, `url`,
`date`, `time`, `datetime-local`, `color`, `checkbox`, `textarea`.

The library doesn't validate `htmlType` — any string is allowed.

## How metadata reaches each emitter

| Emitter  | Where it appears                     |
| -------- | ------------------------------------ |
| Zod      | `<Model>Meta` const export           |
| SQLModel | `Field(title=..., schema_extra=...)` |
| Ent      | Struct tag annotations               |
| DBML     | Column notes                         |

If the form metadata isn't relevant to your generation target, the
decorator is silently ignored — `@title` on a `@table` model won't
break the Ent schema, it just doesn't affect the Go output.
