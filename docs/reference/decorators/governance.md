# Governance

Decorators for catalog metadata, multi-tenancy, optimistic locking,
and audit trails. These don't change the column shape — they tag the
schema with operational metadata.

## `@scope(name: string)`

**Target:** model **or** property

Tags the declaration with a scope name. Selectors of the form `#name`
match tagged declarations. See [Scopes](/guide/concepts/scopes).

```typespec
@scope("frontend") @data
model SignInForm { email: string; password: string; }

@table
model User {
  @key id: uuid;
  @scope("frontend") displayName: string;
  passwordHash: string;
}
```

`@scope` accumulates — a model can carry multiple decorators.

**Diagnostics raised:**

- `unused-scope` (warning) — `@scope("name")` declared but no `#name`
  selector references it.

## `@owner(team: string)`

**Target:** model **or** namespace

Records the owning team. Walks up the namespace chain — applying it
to a namespace cascades to every model beneath. Surfaces in generated
file headers and DBML notes.

```typespec
@owner("identity")
namespace FileVault.Identity;

@table model UserAccount { @key id: uuid; }
```

## `@classification(level: string)`

**Target:** model **or** property

Records data classification (e.g. `"public"`, `"internal"`, `"pii"`,
`"secret"`). Surfaces in generated comments / DBML notes.

```typespec
@table
model User {
  @key id: uuid;
  email: string;
  @classification("pii") fullName: string;
  @classification("secret") passwordHash: string;
}
```

The library doesn't validate the level — pick a vocabulary your team
agrees on.

## `@audit(role)`

**Target:** property

Marks a property as an audit trail field. Allowed roles:
`"createdBy"`, `"updatedBy"`.

```typespec
@tableMixin
model AuditFields {
  @audit("createdBy") createdById?: uuid;
  @audit("updatedBy") updatedById?: uuid;
}
```

Emitters can use the role to wire automatic population in their
runtime layer (e.g. SQLAlchemy events, Ent hooks).

## `@tenantId`

**Target:** property

Marks a column as the tenant scope FK in a multi-tenant schema. At
most one `@tenantId` per model.

```typespec
@table
model Document {
  @key id: uuid;
  @tenantId tenantId: uuid;
  @maxLength(200) title: string;
}
```

Emitters use it to:

- Generate row-level security helpers (where supported).
- Surface tenant scoping in DBML notes.

**Diagnostics raised:**

- `multiple-tenant-id-columns` (error).

## `@version`

**Target:** property

Marks a column as the optimistic-locking version. At most one
`@version` per model. The column is auto-incremented on every UPDATE.

```typespec
@table
model Order {
  @key id: uuid;
  @version version: int32 = 0;
  status: string;
}
```

**Per-emitter behavior:**

- **SQLModel** — uses SQLAlchemy's `__mapper_args__["version_id_col"]`.
- **Ent** — generates a version field with the appropriate update hook.

**Diagnostics raised:**

- `multiple-version-columns` (error).
