import type { DecoratorContext, ModelProperty } from "@typespec/compiler";
import {
  ForeignKeyKey,
  MappedByKey,
  ManyToManyKey,
  ManyToManyOwnerKey,
  OnDeleteKey,
  OnUpdateKey,
  PolymorphicKey,
} from "./lib.js";

export function $foreignKey(
  context: DecoratorContext,
  target: ModelProperty,
  field: string,
  referencedField?: string,
): void {
  context.program.stateMap(ForeignKeyKey).set(target, {
    field,
    target: referencedField,
  });
}

export function $mappedBy(context: DecoratorContext, target: ModelProperty, field: string): void {
  context.program.stateMap(MappedByKey).set(target, field);
}

export function $manyToMany(
  context: DecoratorContext,
  target: ModelProperty,
  tableName: string,
): void {
  context.program.stateMap(ManyToManyKey).set(target, tableName);
}

export function $manyToManyOwner(context: DecoratorContext, target: ModelProperty): void {
  context.program.stateMap(ManyToManyOwnerKey).set(target, true);
}

export function $onDelete(context: DecoratorContext, target: ModelProperty, action: string): void {
  context.program.stateMap(OnDeleteKey).set(target, action);
}

export function $onUpdate(context: DecoratorContext, target: ModelProperty, action: string): void {
  context.program.stateMap(OnUpdateKey).set(target, action);
}

export interface PolymorphicConfig {
  allowedTypes: string[];
  idColumn?: string;
}

/**
 * Marks a string column as the discriminator of a polymorphic relation. The
 * column itself is preserved verbatim; emitters add a CHECK constraint over
 * the allowed type values and (when `idColumn` is supplied) an index over
 * the (type, id) pair.
 */
export function $polymorphic(
  context: DecoratorContext,
  target: ModelProperty,
  allowedTypes: string[],
  idColumn?: string,
): void {
  context.program.stateMap(PolymorphicKey).set(target, {
    allowedTypes: [...allowedTypes],
    idColumn: idColumn === "" ? undefined : idColumn,
  });
}
