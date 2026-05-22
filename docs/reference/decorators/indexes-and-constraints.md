# Indexes and constraints

Decorators for declaring indexes, uniques, and CHECK constraints on
single columns. For composite indexes / uniques across multiple
columns, see [Schema and tables](/reference/decorators/schema-and-tables)
(`@@tableIndex`, `@@tableUnique`).

## `@unique(name?: string)`

**Target:** property

Declares a UNIQUE constraint on a single column. Optional `name`
overrides the auto-generated constraint name.

```typespec
@table
model User {
  @key id: uuid;
  @unique @maxLength(320) email: string;
  @unique("users_handle_key") handle: string;
}
```

**Diagnostics raised:**

- `redundant-unique-on-key` (warning) — `@unique` on a `@key` property
  (the primary key already enforces uniqueness).
- `duplicate-constraint-name` (error) — two constraints share a name.

## `@index(name?: string)`

**Target:** property

Declares a non-unique index on a single column.

```typespec
@table
model AuditEvent {
  @key id: uuid;
  @index timestamp: utcDateTime;
  @foreignKey("actorId") @index actor: User;
  actorId: uuid;
}
```

**Diagnostics raised:**

- `redundant-index-on-unique` (warning) — `@index` on a column that's
  already `@unique` (the unique constraint creates an index).

## `@check(name: string, expression: string)`

**Target:** property

Declares a named CHECK constraint. The `name` is required so the
constraint shows up identifiably in migrations and review.

```typespec
@table
model Account {
  @key id: uuid;
  @check("accounts_credits_non_negative", "credits >= 0")
  credits: int32 = 0;

  @check("accounts_username_min_length", "char_length(username) >= 3")
  @maxLength(40)
  username: string;
}
```

The `expression` is raw SQL. The library does not validate the
expression — incorrect SQL will surface at migration time.

**Per-emitter behavior:**

- **Ent** — emits `entsql.Annotation` with the check.
- **SQLModel** — emits `CheckConstraint` in `__table_args__`.
- **DBML** — preserves the check as a column note.

**Diagnostics raised:**

- `duplicate-constraint-name` (error).

## Composite indexes and uniques

For indexes / uniques spanning multiple columns, use the table-level
decorators:

```typespec
@table
model Reservation {
  @key id: uuid;
  hotelId: uuid;
  startDate: plainDate;
  endDate: plainDate;
}

@@tableIndex(Reservation, ["hotelId", "startDate"]);
@@tableUnique(Reservation, ["hotelId", "startDate", "endDate"]);
```

See [Schema and tables](/reference/decorators/schema-and-tables) for
details.
