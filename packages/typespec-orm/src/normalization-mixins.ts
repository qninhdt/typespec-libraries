import { type Model, type Program } from "@typespec/compiler";
import { reportDiagnostic } from "./lib.js";
import { getTypeFullName, isOrmManagedModel, isTable, isTableMixin } from "./helpers.js";
import { getModelOwnProperties } from "./state-types.js";

export function validateMixinChain(program: Program, model: Model): void {
  if (!isTableMixin(program, model)) return;

  const path: Model[] = [];
  const visit = (current: Model) => {
    if (path.includes(current)) {
      const chain = [...path, current].map((item) => item.name).join(" -> ");
      reportDiagnostic(program, {
        code: "mixin-cycle",
        target: current,
        format: { typeName: current.name, chain },
      });
      return;
    }
    path.push(current);
    for (const source of current.sourceModels) {
      if (isTableMixin(program, source.model)) {
        visit(source.model);
      }
    }
    if (current.baseModel && isTableMixin(program, current.baseModel)) {
      visit(current.baseModel);
    }
    path.pop();
  };

  visit(model);
}

export function validateMixinFieldConflicts(
  program: Program,
  model: Model,
  reported: Set<string>,
): void {
  if (!isTable(program, model) && !isTableMixin(program, model)) {
    return;
  }

  const ownership = new Map<string, string>();
  const mixinSources = getModelMixinSources(program, model);
  for (const source of mixinSources) {
    registerMixinOwnership(program, model, source, ownership, reported);
  }
  // Register the child model's own properties as a final source so that any
  // overlap with an inherited mixin field is reported as a conflict (the
  // README documents this is intentional rather than allowed override).
  registerOwnPropertyOwnership(program, model, ownership, reported);
}

function registerOwnPropertyOwnership(
  program: Program,
  model: Model,
  ownership: Map<string, string>,
  reported: Set<string>,
): void {
  const incomingSource = getTypeFullName(program, model);
  // Only own properties — `model.properties` includes spread-inherited fields,
  // which are already registered under their originating mixin and would
  // double-count as conflicts otherwise.
  for (const prop of getModelOwnProperties(model)) {
    const fieldName = prop.name;
    const existingSource = ownership.get(fieldName);
    if (existingSource && existingSource !== incomingSource) {
      reportMixinConflict(program, model, fieldName, incomingSource, existingSource, reported);
    } else {
      ownership.set(fieldName, incomingSource);
    }
  }
}

function getModelMixinSources(program: Program, model: Model): Model[] {
  const mixinSources = model.sourceModels
    .map((source) => source.model)
    .filter((source): source is Model => isTableMixin(program, source));
  if (model.baseModel && isTableMixin(program, model.baseModel)) {
    mixinSources.push(model.baseModel);
  }
  return mixinSources;
}

function registerMixinOwnership(
  program: Program,
  model: Model,
  source: Model,
  ownership: Map<string, string>,
  reported: Set<string>,
): void {
  const incomingSource = getTypeFullName(program, source);
  for (const [fieldName] of source.properties) {
    const existingSource = ownership.get(fieldName);
    if (existingSource && existingSource !== incomingSource) {
      reportMixinConflict(program, model, fieldName, incomingSource, existingSource, reported);
    } else {
      ownership.set(fieldName, incomingSource);
    }
  }
}

function reportMixinConflict(
  program: Program,
  model: Model,
  fieldName: string,
  incomingSource: string,
  existingSource: string,
  reported: Set<string>,
): void {
  const key = `${getTypeFullName(program, model)}:${fieldName}:${incomingSource}:${existingSource}`;
  if (reported.has(key)) return;
  reported.add(key);
  reportDiagnostic(program, {
    code: "mixin-field-conflict",
    target: model,
    format: {
      fieldName,
      incomingSource,
      existingSource,
      typeName: model.name,
    },
  });
}

export function collectMixinSources(
  program: Program,
  model: Model,
  kind: "table" | "data" | "mixin",
): Model[] {
  const mixins = new Map<string, Model>();
  for (const source of getModelSourceCandidates(model)) {
    if (!isOrmManagedModel(program, source)) {
      continue;
    }
    if (kind === "table" || kind === "mixin") {
      if (!isTableMixin(program, source)) {
        continue;
      }
    } else if (isTable(program, source) || isTableMixin(program, source)) {
      continue;
    }

    mixins.set(getTypeFullName(program, source), source);
  }
  return [...mixins.values()].sort((a, b) =>
    getTypeFullName(program, a).localeCompare(getTypeFullName(program, b)),
  );
}

function getModelSourceCandidates(model: Model): Model[] {
  const sources = model.sourceModels.map((source) => source.model);
  if (model.baseModel) {
    sources.push(model.baseModel);
  }
  return sources;
}
