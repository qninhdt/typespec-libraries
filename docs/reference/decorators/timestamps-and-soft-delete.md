# Timestamps and soft delete

Decorators for the standard timestamp columns and soft-deletion
patterns. Compose them via `@tableMixin` for reuse.

## `@autoCreateTime`

**Target:** property

Marks a column as the row's creation timestamp. The database default
is `now()`.

```typespec
@table
model Order {
  @key id: uuid;
  @autoCreateTime createdAt: utcDateTime;
}
```

The property type must be `utcDateTime` (or a compatible date / time
type). Mixing with a literal default raises
`default-expression-conflicts-literal`.

**Diagnostics raised:**

- `auto-time-on-non-datetime` (error).
- `auto-create-and-update-conflict` (error) — `@autoCreateTime` and
  `@autoUpdateTime` on the same property.

## `@autoUpdateTime`

**Target:** property

Marks a column that updates to `now()` on every UPDATE.

```typespec
@table
model Order {
  @key id: uuid;
  @autoUpdateTime updatedAt?: utcDateTime;
}
```

**Per-emitter behavior:**

- **SQLModel** — uses SQLAlchemy's `onupdate=` keyword.
- **Ent** — uses `entgql`-style update hook annotation.
- **DBML** — surfaced as a column note.

**Diagnostics raised:**

- `auto-time-on-non-datetime` (error).

## `@softDelete`

**Target:** property

Marks a column as the soft-delete marker. The property must be a
nullable datetime; emitters can use it to filter out logically
deleted rows.

```typespec
@tableMixin
model SoftDeletable {
  @softDelete deletedAt?: utcDateTime;
}

@table
model Document {
  ...SoftDeletable;
  @key id: uuid;
  title: string;
}
```

The presence of a `@softDelete` column doesn't change SELECT behavior
in any emitter — that's a runtime concern. The decorator simply marks
the column so tooling (linters, dashboards, audit emitters) knows the
intent.

**Diagnostics raised:**

- `soft-delete-on-non-datetime` (error).
- `multiple-soft-deletes` (error) — more than one `@softDelete` per
  model.

## Conventional mixin

The recommended pattern is to bundle these into a `@tableMixin`:

```typespec
@tableMixin
model Timestamped {
  @key id: uuid;
  @autoCreateTime createdAt: utcDateTime;
  @autoUpdateTime updatedAt?: utcDateTime;
}

@tableMixin
model SoftDeletableEntity {
  ...Timestamped;
  @softDelete deletedAt?: utcDateTime;
}

@table
model User { ...SoftDeletableEntity; @unique email: string; }
```
