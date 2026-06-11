# Schema and tables

Decorators that define top-level schema shape — what's a table, what's
a mixin, what's a DTO, what PostgreSQL schema it lives in, and any
table-level indexes and uniques.

## `@table(name?: string)`

**Target:** model

Marks a model as a persisted table. Picked up by Ent, SQLModel, DBML.

```typespec
@table
model User { @key id: uuid; }

@table("user_accounts")
model User { @key id: uuid; }
```

If `name` is omitted, the table name is derived from the model name —
snake_cased and pluralized (`User` → `users`).

**Diagnostics raised:**

- `missing-key` (warning) — table has no `@key`.
- `duplicate-table-name` (error) — two tables resolve to the same name.
- `namespace-required` (error) — declared at the global namespace.

## `@tableMixin`

**Target:** model

Declares a reusable fragment. Validated like a table but never emitted
as a standalone table. Spread it into a `@table` to inherit columns and
decorators.

```typespec
@tableMixin
model Timestamped {
  @key id: uuid;
  @autoCreateTime createdAt: utcDateTime;
}
```

**Diagnostics raised:**

- `mixin-cycle` (error).
- `mixin-field-conflict` (error).

## `@data(label?: string)`

**Target:** model

Marks a DTO / form model. Form emitters (Zod) write it; persistence
emitters skip it (or treat as a struct / Pydantic model).

```typespec
@data
model CreateUserForm {
  email: string;
  password: string;
}
```

A model in a namespace without `@data` _or_ `@table` is treated as a
default form model — Zod emits it; persistence emitters ignore it.

## `@schema(name: string)`

**Target:** model **or** namespace

Sets the PostgreSQL schema the table lives in. Walks up the namespace
chain — applying it to a namespace cascades to every table beneath.

```typespec
@schema("billing")
namespace Demo.Platform.Billing;

@table
model Invoice {} // → schema "billing"
```

If unset, tables go in the default schema (`public`).

## `@@tableIndex(columns: string[], name?: string)`

**Target:** model (augment)

Declares a composite, non-unique index across multiple columns.

```typespec
@table
model Reservation {
  @key id: uuid;
  hotelId: uuid;
  startDate: plainDate;
  endDate: plainDate;
}

@@tableIndex(Reservation, ["hotelId", "startDate"]);
```

**Diagnostics raised:**

- `empty-index-columns` (error).
- `duplicate-column-in-index` (error).

## `@@tableUnique(columns: string[], name?: string)`

**Target:** model (augment)

Declares a composite UNIQUE constraint.

```typespec
@@tableUnique(Reservation, ["hotelId", "startDate", "endDate"]);
```

For single-column unique constraints, use `@unique` on the property
directly. See
[Indexes and constraints](/reference/decorators/indexes-and-constraints).
