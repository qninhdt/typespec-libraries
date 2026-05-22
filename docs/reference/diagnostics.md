# Diagnostics

Every diagnostic code raised by `@qninhdt/typespec-orm` and the four
emitters. Codes are grouped by the package that raises them.

Use Ctrl/⌘+F to find a specific code, or click the anchor in any
diagnostic message you see.

## Severity legend

- **Error** — emission halts. Fix before the build can succeed.
- **Warning** — surfaces during compile but emission continues.

---

## `@qninhdt/typespec-orm`

### Errors

#### `multiple-keys`

Two `@key` decorators on the same model. **Fix:** every `@table` model
needs exactly one primary key.

#### `multiple-soft-deletes`

More than one `@softDelete` on the same model. **Fix:** keep one.

#### `multiple-version-columns`

More than one `@version` per model. **Fix:** keep one.

#### `multiple-tenant-id-columns`

More than one `@tenantId` per model. **Fix:** keep one.

#### `duplicate-table-name`

Two models resolve to the same table name. **Fix:** rename one model
or pass `@table("explicit_name")`.

#### `duplicate-column-name`

Two properties on the same model resolve to the same column. **Fix:**
rename one, or use `@map("alt_name")`.

#### `namespace-required`

A `@table`, `@tableMixin`, or other ORM-managed declaration lives at
the global namespace. **Fix:** wrap it in `namespace Acme.Identity;`.

#### `mixin-cycle`

`@tableMixin` models spread each other in a cycle. **Fix:** flatten
the cycle.

#### `mixin-field-conflict`

Two mixins (or a mixin plus the consumer) declare the same field name.
**Fix:** rename, or model the override explicitly.

#### `filtered-dependency`

A selected model depends on something the filter removed (a mixin, FK
target, enum). **Fix:** include the dependency, or set
`auto-include-dependencies: true`.

#### `unsupported-relation-shape`

The relation can't be classified as 1:1, 1:N, or M:N. **Fix:** review
`@foreignKey` / `@mappedBy` / `@manyToMany` placement.

#### `mapped-by-missing-property`

`@mappedBy("foo")` references a property that doesn't exist on the
target. **Fix:** match the owning navigation property name.

#### `foreign-key-local-missing`

`@foreignKey("col")` references a column that doesn't exist on the
same model. **Fix:** declare the FK column.

#### `foreign-key-target-missing`

`@foreignKey("col", "target")` references a column missing on the
target model. **Fix:** point at an existing column.

#### `foreign-key-type-mismatch`

The FK column's type doesn't match the referenced column. **Fix:**
align scalar types.

#### `foreign-key-set-null-non-nullable`

`@onDelete("SET NULL")` on a non-nullable FK column. **Fix:** make the
FK column optional with `?`.

#### `one-to-one-missing-unique`

A 1:1 relation requires the FK column to be `@unique`. **Fix:** add
`@unique` to the FK.

#### `many-to-many-not-array`

`@manyToMany` placed on a non-array property. **Fix:** make the
property `Target[]`.

#### `many-to-many-target-not-table`

`@manyToMany` points at something that isn't a `@table`. **Fix:** mark
the target as `@table`.

#### `many-to-many-missing-inverse`

Only one side of an M:N declared `@manyToMany`. **Fix:** add the
matching shorthand on the other side with the same table name.

#### `many-to-many-conflicting-table`

The two sides of an M:N pass different table names. **Fix:** match
the names.

#### `many-to-many-conflicting-explicit-table`

The shorthand collides with an explicit `@table` model of the same
name. **Fix:** drop the shorthand or rename the explicit model.

#### `many-to-many-target-missing-key`

The M:N target has no `@key`. **Fix:** add a primary key.

#### `default-expression-conflicts-literal`

Both `= literal` and `@defaultExpression(...)` on the same property.
**Fix:** keep one.

#### `unsupported-persistence-type`

The property's type can't be persisted by any emitter. **Fix:** pick a
supported scalar.

#### `composite-column-not-found`

A `composite<...>` column references a non-existent column. **Fix:**
use existing column names.

#### `empty-composite-columns`

`composite<>` with no arguments. **Fix:** supply at least one column.

#### `duplicate-column-in-composite`

Same column listed twice in a `composite<...>`. **Fix:** dedupe.

#### `composite-column-conflict`

Two composites disagree about a column's role. **Fix:** unify them.

#### `precision-on-non-numeric`

`@precision` on a non-numeric scalar. **Fix:** use a numeric scalar
(`decimal`, `decimal128`, `float64`, etc.).

#### `auto-increment-on-non-integer`

`@autoIncrement` on a non-integer column. **Fix:** use `int8` / `int16`
/ `int32` / `int64` / `uint*`.

#### `soft-delete-on-non-datetime`

`@softDelete` on a non-datetime column. **Fix:** use `utcDateTime?`.

#### `auto-time-on-non-datetime`

`@autoCreateTime` / `@autoUpdateTime` on a non-datetime column.
**Fix:** use a datetime scalar.

#### `auto-create-and-update-conflict`

`@autoCreateTime` and `@autoUpdateTime` on the same property.
**Fix:** split into two columns.

#### `multiple-auto-increment-columns`

More than one `@autoIncrement` per model. **Fix:** keep one.

#### `auto-increment-requires-key`

`@autoIncrement` without `@key` on the same property. **Fix:** add
`@key`.

#### `ignore-conflicts`

`@ignore` plus a database decorator (`@unique`, `@check`, `@map`).
**Fix:** drop the conflicting decorator.

#### `duplicate-constraint-name`

Two constraints share an explicit name. **Fix:** rename one.

#### `empty-index-columns`

`@@tableIndex(Model, [])`. **Fix:** supply column names.

#### `duplicate-column-in-index`

Same column listed twice in `@@tableIndex` / `@@tableUnique`.
**Fix:** dedupe.

### Warnings

#### `missing-key`

A `@table` model has no `@key`. **Fix:** add a primary key.

#### `redundant-unique-on-key`

`@unique` on a `@key` column — primary keys are already unique.

#### `redundant-index-on-unique`

`@index` on a column that's already `@unique`.

#### `redundant-map`

`@map` matches the auto-derived column name.

#### `cascade-without-relation`

`@onDelete` / `@onUpdate` on a non-relation property.

#### `foreign-key-without-index`

FK column has no `@index`. PostgreSQL hot spot — index recommended.

#### `filter-selector-conflict`

Same selector in both `include` and `exclude`.

#### `filter-selector-redundant`

Selector matches the same set as a parent already in the list.

#### `redundant-include-selector`

Selector matches nothing beyond what's already included.

#### `unused-scope`

`@scope("name")` declared but no `#name` selector references it.

#### `pg-reserved-identifier`

Column / table name is a PostgreSQL reserved word.

---

## `@qninhdt/typespec-ent`

#### `standalone-requires-library-name` (error)

`standalone: true` set without `library-name`. **Fix:** add
`library-name: "github.com/acme/models"`.

#### `unsupported-type` (error)

A property type can't be mapped to Go. **Fix:** use a supported scalar.

#### `missing-back-reference` (error)

A self-referencing M:N requires explicit `@backPopulates` to
distinguish sides.

#### `on-update-not-supported-by-ent` (warning)

`@onUpdate(...)` was dropped because Ent doesn't natively emit
ON UPDATE. **Fix:** set `on-update-emit-raw-sql: true` to surface as
a SQL annotation.

#### `cross-package-edge` (error)

A relation crosses Go packages (top-level namespaces). **Fix:** keep
related models in the same top-level namespace, or split into
separate emitter outputs.

#### `referenced-column-fk-not-supported-by-ent` (error)

`@foreignKey(col, "non-key-col")` — Ent only supports key-targeted
FKs. **Fix:** point at the target's `@key`, or switch to SQLModel /
DBML.

#### `emit-write-failed` (error)

The output writer threw. Usually a filesystem error.

#### `no-tables-found` (warning)

No `@table` / `@data` models in the selection. The emitter writes
no files.

---

## `@qninhdt/typespec-sqlmodel`

#### `standalone-requires-library-name` (error)

Same as Ent. **Fix:** add `library-name: "acme-models"`.

#### `unsupported-type` (error)

A property type can't be mapped to Python.

#### `missing-back-reference` (warning)

A 1:N is missing its inverse N:1. **Fix:** add the matching
`@mappedBy`.

#### `emit-write-failed` (error)

Filesystem write failed.

#### `no-tables-found` (warning)

No tables in the selection.

#### `cross-namespace-many-to-many-unsupported` (error)

M:N relation crosses top-level packages. **Fix:** keep both sides in
the same top-level.

#### `init-export-collision` (error)

Two models with the same name resolve into the same `__init__.py`
re-export.

#### `filtered-association-table-missing` (error)

M:N association table is anchored under a top-level package that the
filter excluded.

---

## `@qninhdt/typespec-zod`

#### `standalone-requires-library-name` (error)

**Fix:** add `library-name: "@acme/forms"`.

#### `unsupported-type` (error)

Property type can't be mapped to Zod.

#### `emit-write-failed` (error)

Filesystem write failed.

---

## `@qninhdt/typespec-dbml`

#### `unsupported-type` (error)

Column type can't be mapped to DBML.

#### `invalid-enum-default` (warning)

A column default isn't a member of the enum.

#### `emit-write-failed` (error)

Filesystem write failed.

#### `association-column-type-fallback` (error)

Many-to-many endpoint key isn't a mappable type.
