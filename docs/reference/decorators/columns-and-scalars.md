# Columns and scalars

Decorators that affect how a single property maps to a database column.

## `@map(columnName: string)`

**Target:** property

Overrides the column name. By default, properties are snake_cased
(`emailAddress` → `email_address`). Use `@map` for legacy column names
or to follow a different convention.

```typespec
@table
model User {
  @key id: uuid;
  @map("user_email") emailAddress: string;
}
```

**Diagnostics raised:**

- `redundant-map` (warning) — `@map` matches the auto-derived name.
- `duplicate-column-name` (error) — two properties resolve to the same
  column.

## `@autoIncrement`

**Target:** property

Marks an integer column as auto-incrementing. Requires `@key` on the
same property and an integer scalar.

```typespec
@table
model AuditLog {
  @key @autoIncrement id: int64;
  message: string;
}
```

For PostgreSQL, this typically renders as `serial` / `bigserial`. The
library's built-in `serial` and `bigserial` scalars imply
`@autoIncrement` and `@key`.

**Diagnostics raised:**

- `auto-increment-on-non-integer` (error).
- `auto-increment-requires-key` (error).
- `multiple-auto-increment-columns` (error).

## `@defaultExpression(expression: string)`

**Target:** property

A SQL expression default — evaluated by the database, not by the
emitted model. Use for things like `now()`, `gen_random_uuid()`, or
custom expressions.

```typespec
@table
model Token {
  @key id: uuid;
  @defaultExpression("gen_random_uuid()") nonce: uuid;
  @defaultExpression("now() + interval '1 hour'") expiresAt: utcDateTime;
}
```

For literal defaults, prefer `= value`:

```typespec
draft: boolean = true;
priority: int32 = 5;
```

**Diagnostics raised:**

- `default-expression-conflicts-literal` (error) — both
  `@defaultExpression` and a literal default are set.

## `@precision(precision: int32, scale?: int32)`

**Target:** property

Sets numeric precision for `decimal`, `decimal128`, or floating-point
columns.

```typespec
@table
model Invoice {
  @key id: uuid;
  @precision(12, 2) total: decimal;
  @precision(8, 4) exchangeRate: float64;
}
```

**Diagnostics raised:**

- `precision-on-non-numeric` (error).

## `@ignore`

**Target:** property

Excludes a property from persistence. The property still exists in the
TypeSpec model — it's just not emitted as a database column. Useful for
transient or computed fields.

```typespec
@table
model Cart {
  @key id: uuid;
  items: jsonb;
  @ignore subtotal: decimal; // computed at runtime
}
```

**Diagnostics raised:**

- `ignore-conflicts` (error) — `@ignore` plus a database decorator
  (`@unique`, `@check`, `@map`, etc.) on the same property.
