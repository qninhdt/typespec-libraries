import { walkPropertiesInherited, type Model, type Program, type Type } from "@typespec/compiler";
import { DataKey, TableKey, TableMixinKey, reportDiagnostic } from "./lib.js";
import {
  camelToSnake,
  getDataLabel,
  getManyToMany,
  getMappedBy,
  getNamespaceFullName,
  getNamespaceSegments,
  getTableName,
  getTypeFullName,
  getForeignKeyConfig,
  isData,
  isIgnored,
  isTable,
  isTableMixin,
  resolveDbType,
  resolveRelation,
  unwrapArrayType,
} from "./helpers.js";

export interface OrmSelector {
  raw: string;
}

export interface NormalizedDependency {
  kind: "model" | "mixin" | "enum" | "scalar";
  fullName: string;
  namespace?: string;
  soft?: boolean;
}

export interface NormalizedOrmModel {
  kind: "table" | "data" | "mixin";
  model: Model;
  name: string;
  fullName: string;
  namespace: string;
  namespaceSegments: string[];
  namespacePath: string[];
  namespaceDir: string;
  packageName: string;
  tableName?: string;
  label?: string;
  mixins: Model[];
  dependencies: NormalizedDependency[];
}

export interface NormalizedOrmGraph {
  models: NormalizedOrmModel[];
  byModel: Map<Model, NormalizedOrmModel>;
}

export interface OrmEmitterSelection {
  models: NormalizedOrmModel[];
  byNamespace: Map<string, NormalizedOrmModel[]>;
  topLevelNamespaces: string[];
}

interface SelectionOptions {
  include?: string[];
  exclude?: string[];
  kinds: Array<NormalizedOrmModel["kind"]>;
}

const BUILTIN_NAMESPACE = "TypeSpec";
const ORM_NAMESPACE = "Qninhdt.Orm";

export function getLibraryLeafName(libraryName: string): string {
  const trimmed = libraryName.trim();
  const leaf = [...trimmed.split("/")].reverse().find(Boolean) ?? trimmed;
  return leaf.replaceAll(/[^\w]/g, "_");
}

export function getRelativeImportPath(
  fromSegments: string[],
  toSegments: string[],
  leaf: string,
): string {
  let common = 0;
  while (
    common < fromSegments.length &&
    common < toSegments.length &&
    fromSegments[common] === toSegments[common]
  ) {
    common++;
  }

  const up = fromSegments.length - common;
  const down = toSegments.slice(common);
  const parts = [...new Array(up).fill(".."), ...down, leaf].filter(Boolean);
  if (parts.length === 0) {
    return ".";
  }
  if (parts[0] !== "..") {
    return `./${parts.join("/")}`;
  }
  return parts.join("/");
}

export function selectorMatchesName(
  selector: string,
  fullName: string,
  namespace: string | undefined,
): boolean {
  return (
    fullName === selector ||
    fullName.startsWith(`${selector}.`) ||
    namespace === selector ||
    (namespace?.startsWith(`${selector}.`) ?? false)
  );
}

export function normalizeOrmGraph(program: Program): NormalizedOrmGraph {
  const entities = new Map<Model, NormalizedOrmModel>();
  const globalNamespace = program.getGlobalNamespaceType();
  const namespaceReported = new Set<string>();
  const conflictReported = new Set<string>();

  const register = (model: Model, kind: NormalizedOrmModel["kind"]) => {
    if (entities.has(model)) {
      const existing = entities.get(model)!;
      if (existing.kind !== kind) {
        const nextKind = existing.kind === "table" ? "table" : kind;
        entities.set(model, {
          ...existing,
          kind: nextKind,
        });
      }
      return;
    }

    const namespace = getNamespaceFullName(model.namespace, globalNamespace);
    if (!namespace) {
      const key = `${kind}:${model.name}`;
      if (!namespaceReported.has(key)) {
        namespaceReported.add(key);
        reportDiagnostic(program, {
          code: "namespace-required",
          target: model,
          format: { kind, typeName: model.name },
        });
      }
      return;
    }

    const namespaceSegments = getNamespaceSegments(model.namespace, globalNamespace);
    const namespacePath = namespaceSegments.map((segment) => camelToSnake(segment));
    entities.set(model, {
      kind,
      model,
      name: model.name,
      fullName: getTypeFullName(program, model),
      namespace,
      namespaceSegments,
      namespacePath,
      namespaceDir: namespacePath.join("/"),
      packageName: namespacePath[namespacePath.length - 1]!,
      tableName: kind === "table" ? getTableName(program, model) : undefined,
      label: kind === "data" ? getDataLabel(program, model) : undefined,
      mixins: collectMixinSources(program, model),
      dependencies: [],
    });
  };

  for (const [node] of program.stateMap(TableKey)) {
    if ((node as { kind?: string }).kind === "Model") {
      register(node as Model, "table");
    }
  }
  for (const [node] of program.stateMap(DataKey)) {
    if ((node as { kind?: string }).kind === "Model") {
      register(node as Model, "data");
    }
  }
  for (const [node] of program.stateMap(TableMixinKey)) {
    if ((node as { kind?: string }).kind === "Model") {
      register(node as Model, "mixin");
    }
  }

  for (const normalized of entities.values()) {
    validateMixinChain(program, normalized.model);
    validateMixinFieldConflicts(program, normalized.model, conflictReported);
    normalized.dependencies = collectDependencies(program, normalized);
  }

  const models = [...entities.values()].sort((a, b) => a.fullName.localeCompare(b.fullName));
  return { models, byModel: new Map(models.map((model) => [model.model, model])) };
}

export function selectModelsForEmitter(
  program: Program,
  graph: NormalizedOrmGraph,
  options: SelectionOptions,
): OrmEmitterSelection {
  const include = normalizeSelectors(options.include);
  const exclude = normalizeSelectors(options.exclude);

  reportSelectorWarnings(program, include, exclude);

  const selected = graph.models.filter((model) => {
    if (!options.kinds.includes(model.kind)) {
      return false;
    }
    return isDeclarationSelected(model.fullName, model.namespace, include, exclude);
  });

  for (const model of selected) {
    for (const dependency of model.dependencies) {
      if (dependency.soft) continue;
      if (
        !isDeclarationSelected(dependency.fullName, dependency.namespace, include, exclude) &&
        dependency.fullName !== model.fullName
      ) {
        reportDiagnostic(program, {
          code: "filtered-dependency",
          target: model.model,
          format: {
            typeName: model.fullName,
            dependencyKind: dependency.kind,
            dependencyName: dependency.fullName,
          },
        });
      }
    }
  }

  const byNamespace = new Map<string, NormalizedOrmModel[]>();
  for (const model of selected) {
    const group = byNamespace.get(model.namespace) ?? [];
    group.push(model);
    byNamespace.set(model.namespace, group);
  }
  for (const group of byNamespace.values()) {
    group.sort((a, b) => a.fullName.localeCompare(b.fullName));
  }

  const topLevelNamespaces = [...new Set(selected.map((model) => model.namespacePath[0]))]
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));

  return { models: selected, byNamespace, topLevelNamespaces };
}

function normalizeSelectors(values: string[] | undefined): OrmSelector[] {
  return (values ?? [])
    .map((value) => value.trim())
    .filter((value) => value !== "")
    .map((raw) => ({ raw }));
}

function reportSelectorWarnings(
  program: Program,
  include: OrmSelector[],
  exclude: OrmSelector[],
): void {
  const excludeSet = new Set(exclude.map((selector) => selector.raw));

  for (const selector of include) {
    if (excludeSet.has(selector.raw)) {
      reportDiagnostic(program, {
        code: "filter-selector-conflict",
        target: program.getGlobalNamespaceType(),
        format: { selector: selector.raw },
      });
    }
  }

  for (const selectors of [include, exclude]) {
    const sorted = [...selectors].sort((a, b) => a.raw.length - b.raw.length);
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        if (selectorMatchesName(sorted[i].raw, sorted[j].raw, undefined)) {
          reportDiagnostic(program, {
            code: "filter-selector-redundant",
            target: program.getGlobalNamespaceType(),
            format: { selector: sorted[j].raw, coveredBy: sorted[i].raw },
          });
        }
      }
    }
  }
}

function isDeclarationSelected(
  fullName: string,
  namespace: string | undefined,
  include: OrmSelector[],
  exclude: OrmSelector[],
): boolean {
  const included =
    include.length === 0 ||
    include.some((selector) => selectorMatchesName(selector.raw, fullName, namespace));
  if (!included) {
    return false;
  }
  return !exclude.some((selector) => selectorMatchesName(selector.raw, fullName, namespace));
}

function collectMixinSources(program: Program, model: Model): Model[] {
  const mixins = new Map<string, Model>();
  for (const source of model.sourceModels) {
    if (isTableMixin(program, source.model)) {
      mixins.set(getTypeFullName(program, source.model), source.model);
    }
  }
  if (model.baseModel && isTableMixin(program, model.baseModel)) {
    mixins.set(getTypeFullName(program, model.baseModel), model.baseModel);
  }
  return [...mixins.values()].sort((a, b) =>
    getTypeFullName(program, a).localeCompare(getTypeFullName(program, b)),
  );
}

function validateMixinChain(program: Program, model: Model): void {
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

function validateMixinFieldConflicts(program: Program, model: Model, reported: Set<string>): void {
  if (!isTable(program, model) && !isTableMixin(program, model)) {
    return;
  }

  const ownership = new Map<string, string>();
  const mixinSources = getModelMixinSources(program, model);
  for (const source of mixinSources) {
    registerMixinOwnership(program, model, source, ownership, reported);
  }
}

function collectDependencies(
  program: Program,
  normalized: NormalizedOrmModel,
): NormalizedDependency[] {
  const dependencies = new Map<string, NormalizedDependency>();

  const push = createDependencyCollector(normalized, dependencies);

  for (const mixin of normalized.mixins) {
    const dependency = createDependencyFromNamespace(program, mixin, "mixin");
    if (dependency) {
      push(dependency);
    }
  }

  for (const prop of walkPropertiesInherited(normalized.model)) {
    if (isIgnored(program, prop)) continue;

    const relation = resolveRelation(program, prop, normalized.model);
    if (relation) {
      const dependency = createDependencyFromRelation(program, relation.targetModel);
      if (dependency) {
        push(dependency);
      }
      continue;
    }

    if (normalized.kind !== "data") {
      const relationLike = relationLikeType(program, prop.type);
      if (
        relationLike &&
        !getForeignKeyConfig(program, prop) &&
        !getMappedBy(program, prop) &&
        !getManyToMany(program, prop)
      ) {
        reportDiagnostic(program, {
          code: "unsupported-relation-shape",
          target: prop,
          format: {
            propName: prop.name,
            typeName: normalized.fullName,
            targetName: relationLike,
          },
        });
      }
    }

    collectTypeDependencies(program, prop.type, push, new Set());
  }

  return [...dependencies.values()].sort((a, b) => a.fullName.localeCompare(b.fullName));
}

function collectTypeDependencies(
  program: Program,
  type: Type,
  push: (dependency: NormalizedDependency) => void,
  visited: Set<Type>,
): void {
  if (visited.has(type)) return;
  visited.add(type);

  switch (type.kind) {
    case "ModelProperty":
      collectTypeDependencies(program, type.type, push, visited);
      return;
    case "Enum": {
      const namespace = getNamespaceFullName(type.namespace, program.getGlobalNamespaceType());
      if (!namespace) {
        reportDiagnostic(program, {
          code: "namespace-required",
          target: type,
          format: { kind: "enum", typeName: type.name },
        });
        return;
      }
      push({ kind: "enum", fullName: getTypeFullName(program, type), namespace });
      return;
    }
    case "Scalar": {
      const fullName = getTypeFullName(program, type);
      const namespace = getNamespaceFullName(type.namespace, program.getGlobalNamespaceType());
      if (!namespace || namespace === BUILTIN_NAMESPACE || namespace === ORM_NAMESPACE) {
        return;
      }
      if (resolveDbType(type)) {
        return;
      }
      push({ kind: "scalar", fullName, namespace });
      return;
    }
    case "Model": {
      if (type.indexer) {
        collectTypeDependencies(program, type.indexer.key, push, visited);
        collectTypeDependencies(program, type.indexer.value, push, visited);
        return;
      }

      const namespace = getNamespaceFullName(type.namespace, program.getGlobalNamespaceType());
      if (type.name && namespace) {
        push({
          kind: isTableMixin(program, type) ? "mixin" : "model",
          fullName: getTypeFullName(program, type),
          namespace,
        });
        return;
      }

      for (const prop of type.properties.values()) {
        collectTypeDependencies(program, prop.type, push, visited);
      }
      if (type.baseModel) {
        collectTypeDependencies(program, type.baseModel, push, visited);
      }
      return;
    }
    case "Tuple":
      for (const value of type.values) {
        collectTypeDependencies(program, value, push, visited);
      }
      return;
    case "Union":
      for (const variant of type.variants.values()) {
        collectTypeDependencies(program, variant.type, push, visited);
      }
      return;
    default:
      return;
  }
}

function relationLikeType(program: Program, type: Type): string | undefined {
  if (type.kind === "ModelProperty") {
    return relationLikeType(program, type.type);
  }

  if (type.kind === "Model") {
    const arrayElement = unwrapArrayType(type);
    if (arrayElement) {
      if (arrayElement.name) {
        return arrayElement.name;
      }
      return undefined;
    }

    if (
      type.name &&
      (isTable(program, type) || isTableMixin(program, type) || isData(program, type))
    ) {
      return type.name;
    }
  }

  return undefined;
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

function createDependencyCollector(
  normalized: NormalizedOrmModel,
  dependencies: Map<string, NormalizedDependency>,
): (dependency: NormalizedDependency) => void {
  return (dependency) => {
    if (dependency.fullName === normalized.fullName) return;
    dependencies.set(`${dependency.kind}:${dependency.fullName}`, dependency);
  };
}

function createDependencyFromNamespace(
  program: Program,
  type: { name: string; namespace?: Model["namespace"] },
  kind: NormalizedDependency["kind"],
): NormalizedDependency | undefined {
  const namespace = getNamespaceFullName(type.namespace, program.getGlobalNamespaceType());
  if (!namespace) {
    reportDiagnostic(program, {
      code: "namespace-required",
      target: type as never,
      format: { kind, typeName: type.name },
    });
    return undefined;
  }

  return {
    kind,
    fullName: getTypeFullName(program, type),
    namespace,
  };
}

function createDependencyFromRelation(
  program: Program,
  targetModel: Model,
): NormalizedDependency | undefined {
  const kind = isTableMixin(program, targetModel) ? "mixin" : "model";
  return createDependencyFromNamespace(program, targetModel, kind);
}
