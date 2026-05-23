import type { DecoratorContext, Model, ModelProperty, Namespace } from "@typespec/compiler";
import {
  TableKey,
  TableMixinKey,
  SchemaKey,
  ScopesKey,
  OwnerKey,
  ClassificationKey,
  ModelIndexesKey,
  ModelUniquesKey,
  RefineKey,
} from "./lib.js";

export function $table(context: DecoratorContext, target: Model, name?: string): void {
  context.program.stateMap(TableKey).set(target, name ?? "");
}

export function $tableMixin(context: DecoratorContext, target: Model): void {
  context.program.stateMap(TableMixinKey).set(target, true);
}

/**
 * PostgreSQL schema scope for a `@table` model or namespace. Model-level value
 * wins over a namespace-level value.
 */
export function $schema(context: DecoratorContext, target: Model | Namespace, name: string): void {
  context.program.stateMap(SchemaKey).set(target, name);
}

/**
 * Scope a model or property for selector matching. Multiple `@scope`
 * decorators accumulate. Scopes drive emitter `include`/`exclude` selectors
 * of the form `#scopeName`.
 */
export function $scope(
  context: DecoratorContext,
  target: Model | ModelProperty,
  name: string,
): void {
  const map = context.program.stateMap(ScopesKey);
  const existing = (map.get(target) as string[] | undefined) ?? [];
  if (!existing.includes(name)) {
    existing.push(name);
  }
  map.set(target, existing);
}

/**
 * Records the owning team / squad for a model or namespace. Catalog tools
 * read this to attach SLA + on-call metadata to the generated schema.
 */
export function $owner(context: DecoratorContext, target: Model | Namespace, team: string): void {
  context.program.stateMap(OwnerKey).set(target, team);
}

/**
 * Records data classification for a model or column (e.g. "public",
 * "internal", "pii", "secret"). Catalog tools and downstream policies
 * consume this verbatim — emitters do not normalize the value.
 */
export function $classification(
  context: DecoratorContext,
  target: Model | ModelProperty,
  level: string,
): void {
  context.program.stateMap(ClassificationKey).set(target, level);
}

export interface ModelIndexSpec {
  columns: string[];
  name?: string;
}

/**
 * Model-level multi-column index. Use as `@@tableIndex(MyModel, ["a", "b"])`.
 * Replaces the fragile `composite<col1, col2>` scalar trick with a first-class
 * augment that supports any number of columns and an optional explicit name.
 */
export function $tableIndex(
  context: DecoratorContext,
  target: Model,
  columns: string[],
  name?: string,
): void {
  const map = context.program.stateMap(ModelIndexesKey);
  const existing = (map.get(target) as ModelIndexSpec[] | undefined) ?? [];
  existing.push({ columns, name });
  map.set(target, existing);
}

/**
 * Model-level multi-column unique constraint. Use as
 * `@@tableUnique(MyModel, ["a", "b"])`.
 */
export function $tableUnique(
  context: DecoratorContext,
  target: Model,
  columns: string[],
  name?: string,
): void {
  const map = context.program.stateMap(ModelUniquesKey);
  const existing = (map.get(target) as ModelIndexSpec[] | undefined) ?? [];
  existing.push({ columns, name });
  map.set(target, existing);
}

export interface RefineSpec {
  name: string;
  expression: string;
}

/**
 * Model-level Zod refinement. Stored as an array so a single model can carry
 * multiple cross-field rules.
 */
export function $refine(
  context: DecoratorContext,
  target: Model,
  name: string,
  expression: string,
): void {
  const map = context.program.stateMap(RefineKey);
  const existing = (map.get(target) as RefineSpec[] | undefined) ?? [];
  existing.push({ name, expression });
  map.set(target, existing);
}
