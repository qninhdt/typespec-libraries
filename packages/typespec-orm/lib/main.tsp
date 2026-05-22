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

/**
 * Marks a property as a soft delete timestamp. The column type must be a datetime type (`utcDateTime` or `offsetDateTime`). When set, the record is considered deleted (soft-deleted) without actually removing it from the database.
 */
extern dec softDelete(target: ModelProperty);

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

// ─── Optimistic locking & audit / multi-tenant decorators ────────────────────

/**
 * Marks a property as the optimistic-locking version column. Emitters scaffold a
 * `version_id_col` mapper arg (SQLModel) or equivalent hook (Ent). Only one
 * column per model may carry this decorator.
 */
extern dec version(target: ModelProperty);

/**
 * Marks a property as an audit field. The role selects which lifecycle the
 * column tracks: `"createdBy"` is set on insert; `"updatedBy"` is refreshed on
 * every update. Emitters wire this through their event/hook surface.
 */
extern dec audit(target: ModelProperty, role: valueof "createdBy" | "updatedBy");

/**
 * Marks a property as the tenant-scope foreign key. Downstream emitters use
 * this to scaffold multi-tenant policy / row-level security helpers. Only one
 * column per model may carry this decorator.
 */
extern dec tenantId(target: ModelProperty);

// ─── @@tableIndex / @@tableUnique (model-level augments) ─────────────────────

/**
 * Multi-column index on a model. Use the augment form on a table:
 * `@@tableIndex(MyTable, ["a", "b"])`.
 */
extern dec tableIndex(target: Model, columns: valueof string[], name?: valueof string);

/**
 * Multi-column unique constraint on a model. Use the augment form:
 * `@@tableUnique(MyTable, ["a", "b"])`.
 */
extern dec tableUnique(target: Model, columns: valueof string[], name?: valueof string);

// ─── Catalog metadata ────────────────────────────────────────────────────────

/**
 * Scope a model or property for selector matching. Multiple `@scope`
 * decorators accumulate. Scopes drive emitter `include` / `exclude`
 * selectors of the form `#scopeName` and surface to catalog tooling.
 */
extern dec scope(target: Model | ModelProperty, name: valueof string);

/**
 * Records the owning team for a model or namespace. Catalog tools read this
 * to attach SLA + on-call metadata to the generated schema.
 */
extern dec owner(target: Model | Namespace, team: valueof string);

/**
 * Records the data-classification level for a model or column (e.g. `"pii"`,
 * `"internal"`). Treated as opaque metadata by emitters; consumed by catalog
 * tooling and downstream policy.
 */
extern dec classification(target: Model | ModelProperty, level: valueof string);

// ─── Data / Form Decorators ───────────────────────────────────────────────────

/**
 * Marks a model as a data transfer object (DTO) and optionally specifies a label for the model. This can be used to generate forms or API documentation with a human-readable name for the model.
 */
extern dec data(target: Model, label?: valueof string);

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
