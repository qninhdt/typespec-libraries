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

// ─── Table & Column Decorators ───────────────────────────────────────────────

/**
 * Marks a model as a database table and optionally specifies the table name.
 */
extern dec table(target: Model, name?: valueof string);

/**
 * Specifies the column name for a model property. By default, the column name is the same as the property name.
 */
extern dec map(target: ModelProperty, columnName: valueof string);

/**
 * Marks a property as the primary key column. By default, the column name is the same as the property name, but it can be overridden with `@map`.
 */
extern dec index(target: ModelProperty, name?: valueof string);

/**
 * Marks a property as a unique column. By default, the column name is the same as the property name, but it can be overridden with `@map`.
 */
extern dec unique(target: ModelProperty);

/**
 * Marks a property as an auto-incrementing primary key column. The column type is determined by the property's type (e.g. `int32` maps to `serial`, `int64` maps to `bigserial`).
 */
extern dec autoIncrement(target: ModelProperty);

/**
 * Marks a property as a soft delete flag. The column type is boolean and the default value is false. When set to true, the record is considered deleted without actually removing it from the database.
 */
extern dec softDelete(target: ModelProperty);

// ─── Relation Decorators ─────────────────────────────────────────────────────

/**
 * Specifies a foreign key relationship to another model. The `target` parameter is the property that holds the related model, and the `field` parameter is the name of the property on the related model that this foreign key references (usually the primary key).
 */
extern dec foreignKey(target: ModelProperty, field: valueof string);

/**
 * Specifies the inverse side of a relationship defined with `@foreignKey`. The `target` parameter is the property that holds the related model, and the `field` parameter is the name of the property on the related model that references this model (usually a collection of related records).
 */
extern dec mappedBy(target: ModelProperty, field: valueof string);

// ─── Composite Indexes & Unique Constraints ──────────────────────────────────

/**
 * Defines a composite index on multiple columns. The `name` parameter is the name of the index, and the `columns` parameters are the names of the properties that make up the index. The column names should match the property names, not the database column names (i.e. use `Model.field`, not `Model.field::map`).
 */
extern dec compositeIndex(target: Model, name: valueof string, ...columns: valueof string[]);

/**
 * Defines a composite unique constraint on multiple columns. The `name` parameter is the name of the constraint, and the `columns` parameters are the names of the properties that make up the unique constraint. The column names should match the property names, not the database column names (i.e. use `Model.field`, not `Model.field::map`).
 */
extern dec compositeKey(target: Model, name: valueof string, ...columns: valueof string[]);

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
