# Tables and mixins

This page covers the building blocks of a persisted model.

## `@table`

`@table` marks a model as a persisted table. Every emitter that
generates database code (Ent, SQLModel, DBML) picks it up.

```typespec
@table
model User {
  @key id: uuid;
  @unique @maxLength(320) email: string;
}
```

By default the table name is derived from the model name
(`User` → `users`, snake_cased and pluralized). Override with the
`name` argument:

```typespec
@table("user_accounts")
model User { @key id: uuid; }
```

## `@key`

Every `@table` model needs exactly one `@key`. Common choices:

```typespec
// UUID primary key (recommended default)
@key id: uuid;

// Auto-incrementing serial
@key @autoIncrement id: int32;

// Other ID strategies — all built into the library
@key id: ulid;
@key id: cuid2;
@key id: nanoid;
```

`@autoIncrement` requires a `@key` on the same property, and the
property type must be an integer.

## `@tableMixin`

`@tableMixin` declares a reusable fragment. It is validated by the orm
core but never emitted as a standalone table. Spread it into a `@table`
to inherit columns and decorators:

```typespec
@tableMixin
model Timestamped {
  @key id: uuid;
  @autoCreateTime createdAt: utcDateTime;
  @autoUpdateTime updatedAt?: utcDateTime;
}

@tableMixin
model SoftDeletable {
  ...Timestamped;
  @softDelete deletedAt?: utcDateTime;
}

@table
model User {
  ...SoftDeletable;
  @unique email: string;
}
```

Rules:

- Mixins can spread other mixins. Cycles produce `mixin-cycle`.
- Field name conflicts produce `mixin-field-conflict`. Rename or model
  the override explicitly.
- Mixins inherit through to _every_ emitter — Ent renders them as
  `ent.Mixin{}`, SQLModel as Python base classes, DBML as inline columns.

## Columns

Any model property is a column unless decorated with `@ignore`.

```typespec
@table
model Post {
  @key id: uuid;
  title: string;
  body: text;          // PG text, not varchar
  publishedAt?: utcDateTime;
  draft: boolean = true;
  meta: jsonb;
  @ignore computed: string; // skipped from persistence
}
```

`?` makes the column nullable. A `= value` literal becomes the column
default. `@defaultExpression("now()")` becomes a SQL expression default.

### Custom column names

The emitter snake_cases property names. Override with `@map`:

```typespec
@map("user_email") emailAddress: string;
```

If `@map("user_email")` matches the auto-derived name, you'll get a
`redundant-map` warning.

## Constraints inherited from TypeSpec

TypeSpec's built-in validators are propagated:

| TypeSpec                  | Generated effect                    |
| ------------------------- | ----------------------------------- |
| `@maxLength(80)`          | varchar / `MaxLen(80)` / `.max(80)` |
| `@minLength(2)`           | check / `.min(2)`                   |
| `@minValue` / `@maxValue` | numeric range checks                |
| `@pattern("^A.+")`        | regex check / `.regex(...)`         |
| `@format("email")`        | email scalar substitution           |

These are read by every emitter. They don't require an orm decorator.

## Named checks

Database-level CHECK constraints get explicit names so they show up in
migrations and review:

```typespec
@check("users_credits_non_negative", "credits >= 0")
credits: int32 = 0;
```

## Mixed examples

```typespec
namespace Demo.Platform.Content;

@tableMixin
model AuditFields {
  @audit("createdBy") createdById?: uuid;
  @audit("updatedBy") updatedById?: uuid;
}

@table
model Story {
  ...AuditFields;
  @key id: uuid;
  @maxLength(160) title: string;
  body: text;
  @check("stories_min_words", "char_length(body) >= 50") body_check?: boolean;
  @scope("frontend") slug: string;
}
```

Next: how to wire models together with [Relations](/guide/concepts/relations).
