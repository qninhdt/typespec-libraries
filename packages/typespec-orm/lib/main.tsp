import "@typespec/compiler";
import "./tsp-index.js";

using TypeSpec.Reflection;

namespace Qninhdt.Orm;

// ─── Custom Scalar Types ─────────────────────────────────────────────────────

@doc("UUID type - maps to uuid column in PostgreSQL")
scalar uuid extends string;

@doc("Unlimited text - maps to TEXT column (vs VARCHAR for string)")
scalar text extends string;

@doc("JSON binary - maps to JSONB column in PostgreSQL")
scalar jsonb extends string;

@doc("Auto-incrementing 32-bit integer")
scalar serial extends int32;

@doc("Auto-incrementing 64-bit integer")
scalar bigserial extends int64;

// ─── Table & Column Decorators ───────────────────────────────────────────────

extern dec table(target: Model, name?: valueof string);

extern dec id(target: ModelProperty);

extern dec map(target: ModelProperty, columnName: valueof string);

extern dec index(target: ModelProperty, name?: valueof string);

extern dec unique(target: ModelProperty);

extern dec autoIncrement(target: ModelProperty);

extern dec softDelete(target: ModelProperty);

extern dec foreignKey(
  target: ModelProperty,
  foreignTable: valueof string,
  foreignColumn?: valueof string
);

extern dec relation(
  target: ModelProperty,
  type: valueof
    | "one-to-one"
    | "one-to-many"
    | "many-to-one"
    | "many-to-many"
    | "belongs-to",
  foreignKey?: valueof string
);

// ─── Composite Indexes & Unique Constraints ──────────────────────────────────

extern dec compositeIndex(
  target: Model,
  name: valueof string,
  ...columns: valueof string[]
);

extern dec compositeUnique(
  target: Model,
  name: valueof string,
  ...columns: valueof string[]
);

// ─── Timestamp auto-fill ─────────────────────────────────────────────────────

extern dec autoCreateTime(target: ModelProperty);

extern dec autoUpdateTime(target: ModelProperty);

// ─── Precision ───────────────────────────────────────────────────────────────

extern dec precision(
  target: ModelProperty,
  precision: valueof int32,
  scale?: valueof int32
);

// ─── Cascading & FK Constraints ──────────────────────────────────────────────

extern dec onDelete(
  target: ModelProperty,
  action: valueof
    | "CASCADE"
    | "SET NULL"
    | "SET DEFAULT"
    | "RESTRICT"
    | "NO ACTION"
);

extern dec onUpdate(
  target: ModelProperty,
  action: valueof
    | "CASCADE"
    | "SET NULL"
    | "SET DEFAULT"
    | "RESTRICT"
    | "NO ACTION"
);

// ─── Ignore Field ────────────────────────────────────────────────────────────

extern dec ignore(target: ModelProperty);
