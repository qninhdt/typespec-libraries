import "./tsp-index.js";

using TypeSpec.Reflection;

namespace Qninhdt.Orm;

// ─── Custom Scalar Types ─────────────────────────────────────────────────────

/**
 * UUID type - maps to uuid column in PostgreSQL
 */
scalar uuid extends string;

/**
 * Unlimited text - maps to TEXT column (vs VARCHAR for string)
 */
scalar text extends string;

/**
 * JSON binary - maps to JSONB column in PostgreSQL
 */
scalar jsonb extends string;

// ─── Scalars (semantic string/numeric wrappers) ──────────────────────

/**
 * Email address (RFC 5322).
 * Emitters with native email validation (Zod, Pydantic) use it directly;
 * others fall back to the @pattern below.
 */
@pattern("^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$")
scalar email extends string;

/**
 * IPv4 address (dotted-quad notation, e.g. 192.168.1.1).
 */
@pattern("^((25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\.){3}(25[0-5]|2[0-4]\\d|[01]?\\d\\d?)$")
scalar ipv4 extends string;

/**
 * IPv6 address.
 */
@pattern("^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::$|^([0-9a-fA-F]{1,4}:){1,7}:$|^:(:([0-9a-fA-F]{1,4})){1,7}$")
scalar ipv6 extends string;

/**
 * IPv4 or IPv6 address.
 */
scalar ip extends string;

/**
 * CIDR notation (e.g. 192.168.0.0/24 or 2001:db8::/32).
 */
@pattern("^([0-9]{1,3}\\.){3}[0-9]{1,3}/[0-9]{1,2}$|^[0-9a-fA-F:]+/[0-9]{1,3}$")
scalar cidr extends string;

/**
 * MAC address (IEEE 802, colon or hyphen separated).
 */
@pattern("^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$")
scalar mac extends string;

/**
 * Base64-encoded string.
 */
@pattern("^[A-Za-z0-9+/]*={0,2}$")
scalar base64 extends string;

/**
 * Hostname (RFC 1123).
 */
@pattern("^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$")
scalar hostname extends string;

/**
 * CUID - collision-resistant unique identifier (v1).
 */
@pattern("^c[a-z0-9]{24}$")
scalar cuid extends string;

/**
 * CUID2 - next-generation collision-resistant identifier.
 */
@pattern("^[a-z][a-z0-9]{23}$")
scalar cuid2 extends string;

/**
 * ULID - Universally Unique Lexicographically Sortable Identifier.
 */
@pattern("^[0-9A-HJKMNP-TV-Z]{26}$")
scalar ulid extends string;

/**
 * NanoID - compact URL-friendly unique identifier.
 */
@pattern("^[A-Za-z0-9_-]{21}$")
scalar nanoid extends string;

/**
 * JWT - JSON Web Token (header.payload.signature).
 */
@pattern("^[A-Za-z0-9-_]+\\.[A-Za-z0-9-_]+\\.[A-Za-z0-9-_]*$")
scalar jwt extends string;

/**
 * Emoji - one or more emoji characters.
 */
@pattern("^\\p{Emoji}+$")
scalar emoji extends string;

/**
 * Geographic latitude (-90 to 90).
 */
@minValue(-90)
@maxValue(90)
scalar latitude extends float64;

/**
 * Geographic longitude (-180 to 180).
 */
@minValue(-180)
@maxValue(180)
scalar longitude extends float64;

/**
 * Auto-incrementing 32-bit integer
 */
scalar serial extends int32;

/**
 * Auto-incrementing 64-bit integer
 */
scalar bigserial extends int64;

/**
 * Case-insensitive text (PostgreSQL CITEXT extension).
 */
scalar citext extends string;

/**
 * Full-text search vector (PostgreSQL TSVECTOR).
 */
scalar tsvector extends string;

/**
 * Full-text search query (PostgreSQL TSQUERY).
 */
scalar tsquery extends string;

/**
 * Time interval (PostgreSQL INTERVAL).
 */
scalar interval extends duration;

/**
 * IPv4 or IPv6 host address (PostgreSQL INET).
 */
scalar inet extends string;

/**
 * Composite index/unique configuration marker.
 * Use @key for primary composite index, @unique for composite unique constraint.
 * Example: composite<"ownerId", "createdAt">
 */
scalar composite<
  Col1 extends string,
  Col2 extends string,
  Col3 extends string = "",
  Col4 extends string = "",
  Col5 extends string = ""
>;

// ─── Table & Column Decorators ───────────────────────────────────────────────

/**
 * Marks a model as a database table and optionally specifies the table name.
 */
extern dec table(target: Model, name?: valueof string);

/**
 * Marks a model as a reusable table mixin. Mixins are validated and can be
 * composed into tables, but are never emitted as standalone tables.
 */
extern dec tableMixin(target: Model);

/**
 * Specifies the column name for a model property. By default, the column name is the same as the property name.
 */
extern dec map(target: ModelProperty, columnName: valueof string);

/**
 * Marks a property as an index column. By default, the index name is auto-derived from the property name, but it can be overridden with the optional `name` parameter.
 */
extern dec index(target: ModelProperty, name?: valueof string);

/**
 * Marks a property as a unique column. By default, the unique constraint name is auto-derived from the table and column name. Pass `name` to override it (mirrors `@check`/`@index`).
 */
extern dec unique(target: ModelProperty, name?: valueof string);

/**
 * Adds a named database check constraint anchored to a property.
 * The expression is passed through to emitters.
 */
extern dec check(target: ModelProperty, name: valueof string, expression: valueof string);

/**
 * Marks a property as an auto-incrementing primary key column. The column type is determined by the property's type (e.g. `int32` maps to `serial`, `int64` maps to `bigserial`).
 */
extern dec autoIncrement(target: ModelProperty);

// ─── Relation Decorators ─────────────────────────────────────────────────────

/**
 * Specifies a foreign key relationship to another model. The first parameter is
 * the local FK field/column reference, and the optional second parameter is the
 * referenced field/column on the target model. When omitted, the target
 * reference defaults to `id`.
 */
extern dec foreignKey(
  target: ModelProperty,
  field: valueof string,
  referencedField?: valueof string
);

/**
 * Specifies the inverse side of a relationship defined with `@foreignKey`. The `target` parameter is the collection/navigation property on the owning model, and the `field` parameter is the name of the **local property** on the related model that carries the `@foreignKey` decorator (i.e. the property referencing this model).
 */
extern dec mappedBy(target: ModelProperty, field: valueof string);

/**
 * Declares a many-to-many shorthand on an array relation. Emitters synthesize
 * the join table from both sides when the inverse declaration matches.
 */
extern dec manyToMany(target: ModelProperty, tableName: valueof string);

/**
 * Marks the owning side of a `@manyToMany` relation. Exactly one side of a
 * shorthand m2m must own the join table (Ent emits `edge.To(...).StorageKey`);
 * the other side is the inverse (`edge.From(...).Ref`). When neither side is
 * marked, emitters fall back to alphabetic owner-pick with a warning so
 * renames cannot silently rotate join-table column order. Marking both sides
 * is an error.
 */
extern dec manyToManyOwner(target: ModelProperty);

// ─── Timestamp auto-fill ─────────────────────────────────────────────────────

/**
 * Marks a property as an auto-updating timestamp for when a record is created. The column type must be a datetime type (`utcDateTime` or `offsetDateTime`). The value is automatically set to the current timestamp when a new record is inserted.
 */
extern dec autoCreateTime(target: ModelProperty);

/**
 * Marks a property as an auto-updating timestamp for when a record is updated. The column type must be a datetime type (`utcDateTime` or `offsetDateTime`). The value is automatically updated to the current timestamp whenever the record is updated.
 */
extern dec autoUpdateTime(target: ModelProperty);

// ─── Precision ──────────────────────────────────────────────────────────────

/**
 * Specifies the precision and scale for a decimal column. The `precision` parameter is the total number of digits, and the `scale` parameter is the number of digits to the right of the decimal point. For example, `@precision(10, 2)` would allow for numbers up to 99999999.99.
 */
extern dec precision(target: ModelProperty, precision: valueof int32, scale?: valueof int32);

// ─── Cascading & FK Constraints ──────────────────────────────────────────────

/**
 * Specifies the action to take on related records when a record is deleted. The `action` parameter can be one of the following:
 */
extern dec onDelete(
  target: ModelProperty,
  action: valueof "CASCADE" | "SET NULL" | "SET DEFAULT" | "RESTRICT" | "NO ACTION"
);

/**
 * Specifies the action to take on related records when a record is updated. The `action` parameter can be one of the following:
 */
extern dec onUpdate(
  target: ModelProperty,
  action: valueof "CASCADE" | "SET NULL" | "SET DEFAULT" | "RESTRICT" | "NO ACTION"
);

// ─── Ignore Field ────────────────────────────────────────────────────────────

/**
 * Marks a property to be ignored by the ORM (not mapped to a database column). This is useful for properties that are used for business logic or computed values that should not be persisted in the database.
 */
extern dec ignore(target: ModelProperty);

// ─── Schema (PostgreSQL schema scope) ────────────────────────────────────────

/**
 * Specifies the PostgreSQL schema name for a `@table` model or for an entire namespace. Tables placed in a `@schema("billing")` namespace land in the `billing` schema instead of `public`. The decorator can be applied to either a model or its containing namespace; a model-level value wins.
 */
extern dec schema(target: Model | Namespace, name: valueof string);

// ─── Default SQL expression ──────────────────────────────────────────────────

/**
 * Specifies a SQL expression used as the column default. Unlike a TypeSpec literal default (`= 0`), this lets you reference SQL functions like `gen_random_uuid()` or `now()` that the database evaluates at insert time. Mutually exclusive with literal defaults.
 */
extern dec defaultExpression(target: ModelProperty, expression: valueof string);

// ─── Optimistic locking ─────────────────────────────────────────────────────

/**
 * Marks a property as the optimistic-locking version column. Emitters scaffold a
 * `version_id_col` mapper arg (SQLModel) or equivalent hook (Ent). Only one
 * column per model may carry this decorator.
 */
extern dec version(target: ModelProperty);

// ─── @@tableIndex / @@tableUnique (model-level augments) ─────────────────────

/**
 * Multi-column index on a model. Use the augment form on a table:
 * `@@tableIndex(MyTable, ["a", "b"])`.
 *
 * The optional `where` argument is rendered verbatim as a partial-index
 * predicate (e.g. `"deleted_at IS NULL"`). The library does not parse it.
 */
extern dec tableIndex(
  target: Model,
  columns: valueof string[],
  name?: valueof string,
  where?: valueof string
);

/**
 * Multi-column unique constraint on a model. Use the augment form:
 * `@@tableUnique(MyTable, ["a", "b"])`.
 *
 * The optional `where` argument is rendered verbatim as a partial-unique
 * predicate (e.g. `"deleted_at IS NULL"`).
 */
extern dec tableUnique(
  target: Model,
  columns: valueof string[],
  name?: valueof string,
  where?: valueof string
);

// ─── Selector scope ──────────────────────────────────────────────────────────

/**
 * Scope a model or property for selector matching. Multiple `@scope`
 * decorators accumulate. Scopes drive emitter `include` / `exclude`
 * selectors of the form `#scopeName`.
 */
extern dec scope(target: Model | ModelProperty, name: valueof string);

// ─── Data / Form Decorators ───────────────────────────────────────────────────

/**
 * Sets a human-readable title for a form field. This can be used to generate forms or API documentation with a human-readable name for the field. By default, the title is the same as the property name, but it can be overridden with `@map`.
 */
extern dec title(target: ModelProperty, text: valueof string);

/**
 * Sets a placeholder text for an HTML input field. This can be used to generate forms with placeholder text for the field. By default, there is no placeholder text.
 */
extern dec placeholder(target: ModelProperty, text: valueof string);

/**
 * Sets the HTML input type for a scalar type.
 * Must target a Scalar - use `@@inputType(Model.field::type, ...)` for lookup-typed properties.
 */
extern dec inputType(target: Scalar, htmlType: valueof string);

// ─── Polymorphic relations ───────────────────────────────────────────────────

/**
 * Marks a string column as the discriminator of a polymorphic relation. Emits
 * a CHECK constraint enumerating `allowedTypes` and (when `idColumn` is given)
 * adds a compound index over (typeColumn, idColumn).
 *
 * Polymorphic relations cannot have real foreign keys because the target
 * table varies by row. This decorator only formalizes the constraint /
 * indexing pattern — query-time integrity is the application's job.
 *
 * Example:
 *   @table model Workspace {
 *     @key id: uuid;
 *     @polymorphic(#["user", "service_account"], "ownerPrincipalId")
 *     ownerPrincipalType: string;
 *     ownerPrincipalId: uuid;
 *   }
 */
extern dec polymorphic(
  target: ModelProperty,
  allowedTypes: valueof string[],
  idColumn?: valueof string
);

// ─── Index storage type ──────────────────────────────────────────────────────

/**
 * Specifies the PostgreSQL index method for a column-level index. The most
 * common use is `@gin` on a `tsvector` column for full-text search. Must be
 * combined with `@index` (or applied to a `@key`/`@unique` column).
 *
 * Supported methods: `btree` (default — implicit), `gin`, `gist`, `brin`,
 * `hash`, `spgist`. Emitters that cannot model the index method drop it with
 * a warning.
 */
extern dec indexUsing(
  target: ModelProperty,
  method: valueof "btree" | "gin" | "gist" | "brin" | "hash" | "spgist"
);

// ─── Partial-index predicate ─────────────────────────────────────────────────

/**
 * Adds a partial-index predicate to a column-level index. Combines with
 * `@index`, `@unique`, or `@key` and is rendered verbatim as the index's
 * `WHERE` clause (e.g. `"deleted_at IS NULL"`). The library does not parse
 * the predicate; emitters that cannot model partial indexes drop it with a
 * warning.
 *
 * Example:
 *   ```
 *   @index
 *   @partialIndex("deleted_at IS NULL")
 *   slug: string;
 *   ```
 */
extern dec partialIndex(target: ModelProperty, predicate: valueof string);

// ─── Custom Go type for JSONB / opaque columns (Ent-only) ────────────────────

/**
 * Specifies a custom Go type for a column. Primarily used with `jsonb`
 * columns to escape weak `map[string]any{}` typing. The argument must be a
 * fully-qualified import path + symbol name, separated by a dot and using
 * the form `import/path.TypeName`. The Ent emitter generates
 * `field.JSON("col", &MyType{})` and adds the import. Other emitters
 * ignore this decorator.
 */
extern dec goType(target: ModelProperty, importPathAndType: valueof string);

// ─── Custom JS predicate refinement (Zod-only) ───────────────────────────────

/**
 * Adds a JavaScript predicate refinement to the Zod schema for the
 * containing model. The expression is a JS source fragment evaluated against
 * a `data` parameter (the parsed object). The Zod emitter emits
 * `.refine((data) => <expression>, { message: "<name>" })`. Other emitters
 * ignore this decorator. Use it for cross-field rules that cannot be
 * expressed as per-property constraints.
 *
 * Example:
 *   `@@refine(MyForm, "passwordMatch", "data.password === data.confirmPassword")`
 */
extern dec refine(
  target: Model,
  name: valueof string,
  expression: valueof string
);
