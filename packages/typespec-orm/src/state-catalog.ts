import type { Model, ModelProperty, Program, Scalar } from "@typespec/compiler";
import { ScopesKey, TitleKey, PlaceholderKey, InputTypeKey } from "./lib.js";
import { isOrmManagedModel, isTable, isTableMixin } from "./state-columns.js";

/** Returns the scopes applied to a model or property via `@scope`. Empty array if none. */
export function getScopes(program: Program, target: Model | ModelProperty): readonly string[] {
  return (program.stateMap(ScopesKey).get(target) as string[] | undefined) ?? [];
}

/** True when the model or property carries the given scope. */
export function hasScope(program: Program, target: Model | ModelProperty, scope: string): boolean {
  return getScopes(program, target).includes(scope);
}

export function isData(program: Program, model: Model): boolean {
  return (
    isOrmManagedModel(program, model) && !isTable(program, model) && !isTableMixin(program, model)
  );
}

export function getTitle(program: Program, prop: ModelProperty): string | undefined {
  return program.stateMap(TitleKey).get(prop) as string | undefined;
}

export function getPlaceholder(program: Program, prop: ModelProperty): string | undefined {
  return program.stateMap(PlaceholderKey).get(prop) as string | undefined;
}

export function getInputType(program: Program, scalar: Scalar): string | undefined {
  return program.stateMap(InputTypeKey).get(scalar) as string | undefined;
}

export function getCompositeFields(_program: Program, prop: ModelProperty): string[] | undefined {
  const type = prop.type;
  if (type.kind !== "Scalar" || getCompositeScalarName(type) !== "composite") {
    return undefined;
  }
  return getCompositeTemplateColumns(type);
}

function getCompositeScalarName(type: Scalar): string | undefined {
  if (type.name) return type.name;
  const node = (type as Scalar & { node?: { id?: { escapedText?: string } } }).node;
  return node?.id?.escapedText;
}

function getCompositeTemplateColumns(type: Scalar): string[] | undefined {
  const mapper = (type as Scalar & { templateMapper?: { args?: unknown } }).templateMapper;
  const args = mapper?.args;
  if (!args || !Array.isArray(args)) {
    return undefined;
  }

  const columns: string[] = [];
  for (const arg of args) {
    if (!arg || typeof arg !== "object" || !("type" in arg)) {
      continue;
    }

    const typeObj = (arg as { type: unknown }).type as { kind: string; value?: string } | undefined;
    if (typeObj?.kind === "String" && typeObj.value) {
      columns.push(typeObj.value);
    }
  }

  return columns.length > 0 ? columns : undefined;
}
