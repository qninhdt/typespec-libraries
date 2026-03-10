import type { DecoratorContext, Model, ModelProperty } from "@typespec/compiler";
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

// ─── @compositeIndex ─────────────────────────────────────────────────────────

export function $compositeIndex(
  context: DecoratorContext,
  target: Model,
  name: string,
  ...columns: string[]
): void {
  const existing =
    (context.program.stateMap(CompositeIndexKey).get(target) as Array<{
      name: string;
      columns: string[];
    }>) ?? [];
  existing.push({ name, columns });
  context.program.stateMap(CompositeIndexKey).set(target, existing);
}

// ─── @compositeUnique ────────────────────────────────────────────────────────

export function $compositeUnique(
  context: DecoratorContext,
  target: Model,
  name: string,
  ...columns: string[]
): void {
  const existing =
    (context.program.stateMap(CompositeUniqueKey).get(target) as Array<{
      name: string;
      columns: string[];
    }>) ?? [];
  existing.push({ name, columns });
  context.program.stateMap(CompositeUniqueKey).set(target, existing);
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
