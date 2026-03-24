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

/**
 * Auto-incrementing 32-bit integer
 */
scalar serial extends int32;

/**
 * Auto-incrementing 64-bit integer
 */
scalar bigserial extends int64;

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
 * Marks a property as a unique column. By default, the column name is the same as the property name, but it can be overridden with `@map`.
 */
extern dec unique(target: ModelProperty);

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
 * Marks a property as an auto-updating timestamp for when a record is created. The column type is determined by the property's type (e.g. `int64` maps to a bigint timestamp, `Date` maps to a datetime/timestamp column). The value is automatically set to the current timestamp when a new record is inserted.
 */
extern dec autoCreateTime(target: ModelProperty);

/**
 * Marks a property as an auto-updating timestamp for when a record is updated. The column type is determined by the property's type (e.g. `int64` maps to a bigint timestamp, `Date` maps to a datetime/timestamp column). The value is automatically updated to the current timestamp whenever the record is updated.
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
