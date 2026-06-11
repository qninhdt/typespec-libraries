import type { Model, Program } from "@typespec/compiler";
import { TableKey, TableMixinKey, reportDiagnostic } from "./lib.js";
import {
  camelToSnake,
  collectOrmManagedModels,
  findVersionProperty,
  getColumnName,
  getNamespaceFullName,
  getNamespaceSegments,
  getSchemaName,
  getScopes,
  getTableName,
  getTypeFullName,
  isTable,
  isTableMixin,
} from "./helpers.js";
import { collectDependencies } from "./normalization-dependencies.js";
import {
  collectMixinSources,
  validateMixinChain,
  validateMixinFieldConflicts,
} from "./normalization-mixins.js";
import {
  MODEL_KIND_PRIORITY,
  type NormalizedOrmGraph,
  type NormalizedOrmModel,
} from "./normalization-types.js";

const normalizedGraphCache = new WeakMap<Program, NormalizedOrmGraph>();

export function normalizeOrmGraph(program: Program): NormalizedOrmGraph {
  const cached = normalizedGraphCache.get(program);
  if (cached) return cached;
  const graph = computeNormalizedOrmGraph(program);
  normalizedGraphCache.set(program, graph);
  return graph;
}

function collectModelMetadata(
  program: Program,
  model: Model,
  kind: NormalizedOrmModel["kind"],
): {
  schema?: string;
  scopes: string[];
  versionColumn?: string;
} {
  const scopes = [...getScopes(program, model)];
  const schema = kind === "table" ? getSchemaName(program, model) : undefined;

  let versionColumn: string | undefined;
  const versionProp = findVersionProperty(program, model);
  if (versionProp) versionColumn = getColumnName(program, versionProp);

  return { schema, scopes, versionColumn };
}

function computeNormalizedOrmGraph(program: Program): NormalizedOrmGraph {
  const entities = new Map<Model, NormalizedOrmModel>();
  const globalNamespace = program.getGlobalNamespaceType();
  const namespaceReported = new Set<string>();
  const conflictReported = new Set<string>();

  const register = (model: Model, kind: NormalizedOrmModel["kind"]) => {
    if (entities.has(model)) {
      const existing = entities.get(model)!;
      if (
        existing.kind !== kind &&
        MODEL_KIND_PRIORITY[kind] > MODEL_KIND_PRIORITY[existing.kind]
      ) {
        const tableName = kind === "table" ? getTableName(program, model) : undefined;
        const label = kind === "data" ? model.name : undefined;
        entities.set(model, {
          ...existing,
          kind,
          tableName,
          label,
          mixins: collectMixinSources(program, model, kind),
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
    const packageName = namespacePath.at(-1) ?? camelToSnake(model.name);
    const metadata = collectModelMetadata(program, model, kind);
    entities.set(model, {
      kind,
      model,
      name: model.name,
      fullName: getTypeFullName(program, model),
      namespace,
      namespaceSegments,
      namespacePath,
      namespaceDir: namespacePath.join("/"),
      packageName,
      tableName: kind === "table" ? getTableName(program, model) : undefined,
      label: kind === "data" ? model.name : undefined,
      mixins: collectMixinSources(program, model, kind),
      dependencies: [],
      schema: metadata.schema,
      scopes: metadata.scopes,
      versionColumn: metadata.versionColumn,
    });
  };

  for (const [node] of program.stateMap(TableKey)) {
    if ((node as { kind?: string }).kind === "Model") {
      register(node as Model, "table");
    }
  }
  for (const [node] of program.stateMap(TableMixinKey)) {
    if ((node as { kind?: string }).kind === "Model") {
      register(node as Model, "mixin");
    }
  }
  for (const model of collectOrmManagedModels(program)) {
    if (!isTable(program, model) && !isTableMixin(program, model)) {
      register(model, "data");
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
