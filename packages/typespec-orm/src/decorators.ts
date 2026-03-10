import type { DecoratorContext, Model, ModelProperty, Scalar } from "@typespec/compiler";
import {
  TableKey,
  IdKey,
  MapKey,
  IndexKey,
  UniqueKey,
  AutoIncrementKey,
  SoftDeleteKey,
  ForeignKeyKey,
  RelationKey,
  CompositeIndexKey,
  CompositeUniqueKey,
  AutoCreateTimeKey,
  AutoUpdateTimeKey,
  PrecisionKey,
  OnDeleteKey,
  OnUpdateKey,
  IgnoreKey,
  DataKey,
  TitleKey,
  PlaceholderKey,
  InputTypeKey,
} from "./lib.js";

// ─── @table ──────────────────────────────────────────────────────────────────

export function $table(context: DecoratorContext, target: Model, name?: string): void {
  context.program.stateMap(TableKey).set(target, name ?? "");
}

// ─── @id ─────────────────────────────────────────────────────────────────────

export function $id(context: DecoratorContext, target: ModelProperty): void {
  context.program.stateMap(IdKey).set(target, true);
}

// ─── @map ────────────────────────────────────────────────────────────────────

export function $map(context: DecoratorContext, target: ModelProperty, columnName: string): void {
  context.program.stateMap(MapKey).set(target, columnName);
}

// ─── @index ──────────────────────────────────────────────────────────────────

export function $index(context: DecoratorContext, target: ModelProperty, name?: string): void {
  context.program.stateMap(IndexKey).set(target, name ?? "");
}

// ─── @unique ─────────────────────────────────────────────────────────────────

export function $unique(context: DecoratorContext, target: ModelProperty): void {
  context.program.stateMap(UniqueKey).set(target, true);
}

// ─── @autoIncrement ──────────────────────────────────────────────────────────

export function $autoIncrement(context: DecoratorContext, target: ModelProperty): void {
  context.program.stateMap(AutoIncrementKey).set(target, true);
}

// ─── @softDelete ─────────────────────────────────────────────────────────────

export function $softDelete(context: DecoratorContext, target: ModelProperty): void {
  context.program.stateMap(SoftDeleteKey).set(target, true);
}

// ─── @foreignKey ─────────────────────────────────────────────────────────────

export function $foreignKey(
  context: DecoratorContext,
  target: ModelProperty,
  foreignTable: string,
  foreignColumn?: string,
): void {
  context.program.stateMap(ForeignKeyKey).set(target, {
    table: foreignTable,
    column: foreignColumn ?? "id",
  });
}

// ─── @relation ───────────────────────────────────────────────────────────────

export function $relation(
  context: DecoratorContext,
  target: ModelProperty,
  type: string,
  foreignKey?: string,
): void {
  context.program.stateMap(RelationKey).set(target, {
    type,
    foreignKey: foreignKey ?? "",
  });
}

// ─── Shared composite constraint helper ──────────────────────────────────────

function appendCompositeConstraint(
  context: DecoratorContext,
  target: Model,
  stateKey: typeof CompositeIndexKey,
  name: string,
  columns: string[],
): void {
  const existing =
    (context.program.stateMap(stateKey).get(target) as Array<{
      name: string;
      columns: string[];
    }>) ?? [];
  existing.push({ name, columns });
  context.program.stateMap(stateKey).set(target, existing);
}

// ─── @compositeIndex ─────────────────────────────────────────────────────────

export function $compositeIndex(
  context: DecoratorContext,
  target: Model,
  name: string,
  ...columns: string[]
): void {
  appendCompositeConstraint(context, target, CompositeIndexKey, name, columns);
}

// ─── @compositeUnique ────────────────────────────────────────────────────────

export function $compositeUnique(
  context: DecoratorContext,
  target: Model,
  name: string,
  ...columns: string[]
): void {
  appendCompositeConstraint(context, target, CompositeUniqueKey, name, columns);
}

// ─── @autoCreateTime ─────────────────────────────────────────────────────────

export function $autoCreateTime(context: DecoratorContext, target: ModelProperty): void {
  context.program.stateMap(AutoCreateTimeKey).set(target, true);
}

// ─── @autoUpdateTime ─────────────────────────────────────────────────────────

export function $autoUpdateTime(context: DecoratorContext, target: ModelProperty): void {
  context.program.stateMap(AutoUpdateTimeKey).set(target, true);
}

// ─── @precision ──────────────────────────────────────────────────────────────

export function $precision(
  context: DecoratorContext,
  target: ModelProperty,
  precision: number,
  scale?: number,
): void {
  context.program.stateMap(PrecisionKey).set(target, {
    precision,
    scale: scale ?? 0,
  });
}

// ─── @onDelete ───────────────────────────────────────────────────────────────

export function $onDelete(context: DecoratorContext, target: ModelProperty, action: string): void {
  context.program.stateMap(OnDeleteKey).set(target, action);
}

// ─── @onUpdate ───────────────────────────────────────────────────────────────

export function $onUpdate(context: DecoratorContext, target: ModelProperty, action: string): void {
  context.program.stateMap(OnUpdateKey).set(target, action);
}

// ─── @ignore ─────────────────────────────────────────────────────────────────

export function $ignore(context: DecoratorContext, target: ModelProperty): void {
  context.program.stateMap(IgnoreKey).set(target, true);
}
// ─── @data ────────────────────────────────────────────────────────────────

/**
 * Mark a model as a non-database data shape (form payload, API response DTO, etc.).
 * Unlike @table, this does NOT generate a DB schema.
 */
export function $data(context: DecoratorContext, target: Model, label?: string): void {
  context.program.stateMap(DataKey).set(target, label ?? target.name);
}

// ─── @title ────────────────────────────────────────────────────────────────

/** Human-readable title for a form field (maps to Pydantic Field(title=...) / Go form tag). */
export function $title(context: DecoratorContext, target: ModelProperty, text: string): void {
  context.program.stateMap(TitleKey).set(target, text);
}

// ─── @placeholder ─────────────────────────────────────────────────

/** Placeholder text shown inside an input before the user types. */
export function $placeholder(context: DecoratorContext, target: ModelProperty, text: string): void {
  context.program.stateMap(PlaceholderKey).set(target, text);
}

// ─── @inputType ──────────────────────────────────────────────────

/**
 * HTML input type override for string-based scalars (e.g. "email", "url", "tel").
 * Intentionally targets Scalar (not ModelProperty) - see the derived.tsp example
 * for the @@inputType(Model.field::type, ...) augment pattern needed when the
 * property uses a lookup type.
 */
export function $inputType(context: DecoratorContext, target: Scalar, htmlType: string): void {
  context.program.stateMap(InputTypeKey).set(target, htmlType);
}
