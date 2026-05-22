# Relations

Relations connect tables. The orm core resolves them once; every
emitter consumes the resolved relation graph.

## Many-to-one (the default)

A non-array property pointing at another `@table` is a many-to-one
relation. The owning side carries the foreign key column.

```typespec
@table
model Organization {
  @key id: uuid;
  @unique code: string;
}

@table
model User {
  @key id: uuid;
  organizationId: uuid;

  @foreignKey("organizationId")
  organization: Organization;
}
```

`@foreignKey("organizationId")` says "this navigation property uses
`organizationId` as its FK column". The default referenced column is
the target's `@key`.

### Referenced-column FKs

If you want to point at a non-key column (a `@unique` lookup column),
pass a second argument:

```typespec
@table
model Organization {
  @key id: uuid;
  @unique code: string;
}

@table
model User {
  organizationCode: string;

  @foreignKey("organizationCode", "code")
  organization: Organization;
}
```

`organizationCode` becomes the FK column, referencing
`organization.code`. The target column must be `@unique`.

::: warning Ent doesn't support referenced-column FKs
The Ent emitter requires the FK to point at the target's `@key`. Ent
schemas with referenced-column FKs produce
`referenced-column-fk-not-supported-by-ent`. SQLModel and DBML accept
them.
:::

## One-to-many (inverse navigation)

The inverse side of a many-to-one. Use `@mappedBy` to name the property
on the owning side that drives this relation:

```typespec
@table
model Organization {
  @key id: uuid;

  @mappedBy("organization")
  users: User[];
}
```

The orm core resolves `@mappedBy("organization")` to the `organization`
property on `User`, finds its `@foreignKey`, and builds a one-to-many
edge. No FK column is generated on `Organization` — the inverse is
navigation-only.

## One-to-one

Same shape as many-to-one, but the FK column must be `@unique`:

```typespec
@table
model User { @key id: uuid; }

@table
model UserProfile {
  @key id: uuid;
  @unique userId: uuid;

  @foreignKey("userId")
  user: User;
}
```

Without `@unique` on the FK column, you get
`one-to-one-missing-unique`.

## Many-to-many shorthand

When the join table has no payload columns, use the
`@manyToMany("name")` shorthand on **both** sides with the same name:

```typespec
@table
model User {
  @key id: uuid;

  @manyToMany("user_badges")
  badges?: Badge[];
}

@table
model Badge {
  @key id: uuid;

  @manyToMany("user_badges")
  users?: User[];
}
```

The orm core synthesizes a `user_badges` join table with
`(user_id, badge_id)`. Each emitter materializes it differently:

- **Ent** — `edge.To(...).StorageKey(edge.Table("user_badges"), ...)`
- **SQLModel** — a `Table` in `__associations__.py`
- **DBML** — an explicit join table block plus two `Ref:` lines

If you need payload columns on the join (e.g. `assignedAt`), don't use
shorthand — declare the junction model explicitly with `@table` and two
`@foreignKey` properties.

### Common errors

- `many-to-many-missing-inverse` — only one side declared `@manyToMany`.
- `many-to-many-conflicting-table` — sides disagree on the table name.
- `many-to-many-conflicting-explicit-table` — shorthand collides with
  an explicit `@table` model of the same name.

## Cascading actions

`@onDelete` and `@onUpdate` declare PostgreSQL FK actions:

```typespec
@table
model Comment {
  postId: uuid;

  @foreignKey("postId")
  @onDelete("CASCADE")
  post: Post;
}
```

Supported actions: `CASCADE`, `SET NULL`, `SET DEFAULT`, `RESTRICT`,
`NO ACTION`.

::: warning Ent and ON UPDATE
Ent doesn't emit ON UPDATE clauses. By default `@onUpdate(...)` is
dropped with a warning. Set `on-update-emit-raw-sql: true` on the Ent
emitter to surface it as a SQL annotation comment instead.
:::

`SET NULL` requires the FK column to be nullable
(`foreign-key-set-null-non-nullable`).

Next: [Scopes](/guide/concepts/scopes) for cross-cutting selection.
