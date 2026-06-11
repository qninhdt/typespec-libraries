# Relations

Decorators that connect tables. See
[Concepts / Relations](/guide/concepts/relations) for the conceptual
overview.

## `@foreignKey(field: string, referencedField?: string)`

**Target:** property (the navigation property)

Marks the owning side of a many-to-one relation. `field` is the name of
the FK column on the same model; `referencedField` is the column on
the target (defaults to the target's `@key`).

```typespec
@table
model Post {
  @key id: uuid;
  authorId: uuid;

  @foreignKey("authorId")
  author: User;
}
```

Referenced-column FK:

```typespec
@table
model User {
  organizationCode: string;

  @foreignKey("organizationCode", "code")
  organization: Organization;
}
```

::: warning Ent supports key-only FKs
The Ent emitter raises `referenced-column-fk-not-supported-by-ent`
when `referencedField` points at a non-key column. SQLModel and DBML
accept any `@unique` column.
:::

**Diagnostics raised:**

- `foreign-key-local-missing` (error) — `field` doesn't exist.
- `foreign-key-target-missing` (error) — `referencedField` doesn't exist
  on the target.
- `foreign-key-type-mismatch` (error) — FK column type doesn't match
  the target column.
- `foreign-key-set-null-non-nullable` (error) — `@onDelete("SET NULL")`
  on a non-nullable FK.
- `foreign-key-without-index` (warning) — no `@index` on the FK column.

## `@mappedBy(field: string)`

**Target:** property (the inverse navigation property)

Marks the inverse side of a many-to-one. `field` is the name of the
owning navigation property on the related model.

```typespec
@table
model User {
  @key id: uuid;

  @mappedBy("author")
  posts: Post[];
}
```

The orm core resolves `@mappedBy("author")` to `Post.author`, finds
its `@foreignKey`, and builds a one-to-many relation.

**Diagnostics raised:**

- `mapped-by-missing-property` (error).

## `@manyToMany(tableName: string)`

**Target:** property (an array property)

Declares a many-to-many shorthand. Both sides must opt in with the
same `tableName`.

```typespec
@table
model User {
  @manyToMany("user_badges") badges?: Badge[];
}

@table
model Badge {
  @manyToMany("user_badges") users?: User[];
}
```

The orm core synthesizes a join table named `user_badges` with two FK
columns (`user_id`, `badge_id`).

**Diagnostics raised:**

- `many-to-many-not-array` (error).
- `many-to-many-target-not-table` (error).
- `many-to-many-missing-inverse` (error).
- `many-to-many-conflicting-table` (error) — sides disagree on the
  table name.
- `many-to-many-conflicting-explicit-table` (error) — shorthand
  collides with an explicit `@table` model of the same name.
- `many-to-many-target-missing-key` (error).

## `@onDelete(action)`

**Target:** property (the navigation property)

PostgreSQL FK action when the referenced row is deleted.

```typespec
@table
model Comment {
  @foreignKey("postId") @onDelete("CASCADE")
  post: Post;
  postId: uuid;
}
```

Allowed actions: `"CASCADE"`, `"SET NULL"`, `"SET DEFAULT"`,
`"RESTRICT"`, `"NO ACTION"`.

## `@onUpdate(action)`

**Target:** property (the navigation property)

Same allowed actions as `@onDelete`. Triggered when the referenced
column is updated.

::: warning Ent doesn't natively support ON UPDATE
By default `@onUpdate` is dropped on the Ent emitter with
`on-update-not-supported-by-ent`. Set
`on-update-emit-raw-sql: true` to surface it as a SQL annotation
comment.
:::

**Diagnostics raised:**

- `cascade-without-relation` (warning) — `@onDelete` / `@onUpdate` on
  a non-relation property.
