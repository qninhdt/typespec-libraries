import {
  walkPropertiesInherited,
  type Model,
  type ModelProperty,
  type Program,
  type Type,
} from "@typespec/compiler";
import { ORM_NAMESPACE, reportDiagnostic } from "./lib.js";
import {
  getEnumMembers,
  getForeignKeyConfig,
  getManyToMany,
  getMappedBy,
  getNamespaceFullName,
  getTypeFullName,
  isData,
  isEnum,
  isIgnored,
  isTable,
  isTableMixin,
  resolveDbType,
  resolveRelation,
  unwrapArrayType,
} from "./helpers.js";
import {
  BUILTIN_NAMESPACE,
  type NormalizedDependency,
  type NormalizedOrmModel,
} from "./normalization-types.js";

export function collectDependencies(
  program: Program,
  normalized: NormalizedOrmModel,
): NormalizedDependency[] {
  const dependencies = new Map<string, NormalizedDependency>();

  const push = createDependencyCollector(normalized, dependencies);

  for (const mixin of normalized.mixins) {
    const dependency = createDependencyFromNamespace(
      program,
      mixin,
      isTableMixin(program, mixin) ? "mixin" : "model",
    );
    if (dependency) {
      push(dependency);
    }
  }

  for (const prop of walkPropertiesInherited(normalized.model)) {
    if (isIgnored(program, prop)) continue;

    if (pushRelationDependency(program, normalized, prop, push)) {
      continue;
    }

    reportUnsupportedRelationShape(program, normalized, prop);
    collectPropertyDependencies(program, prop, push);
  }

  return [...dependencies.values()].sort((a, b) => a.fullName.localeCompare(b.fullName));
}

function collectPropertyDependencies(
  program: Program,
  prop: ModelProperty,
  push: (dependency: NormalizedDependency) => void,
): void {
  collectTypeDependencies(program, prop.type, push, new Set());
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
      pushEnumDependency(program, type, push);
      return;
    }
    case "Scalar": {
      pushScalarDependency(program, type, push);
      return;
    }
    case "Model": {
      collectModelDependencies(program, type, push, visited);
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

function pushEnumDependency(
  program: Program,
  type: Extract<Type, { kind: "Enum" }>,
  push: (dependency: NormalizedDependency) => void,
): void {
  const namespace = getNamespaceFullName(type.namespace, program.getGlobalNamespaceType());
  if (!namespace) {
    reportDiagnostic(program, {
      code: "namespace-required",
      target: type,
      format: { kind: "enum", typeName: type.name },
    });
    return;
  }

  const members = isEnum(type) ? getEnumMembers(type) : undefined;
  push({
    kind: "enum",
    fullName: getTypeFullName(program, type),
    namespace,
    enumMembers: members,
  });
}

function pushScalarDependency(
  program: Program,
  type: Extract<Type, { kind: "Scalar" }>,
  push: (dependency: NormalizedDependency) => void,
): void {
  const namespace = getNamespaceFullName(type.namespace, program.getGlobalNamespaceType());
  if (
    !namespace ||
    namespace === BUILTIN_NAMESPACE ||
    namespace === ORM_NAMESPACE ||
    resolveDbType(type)
  ) {
    return;
  }

  push({ kind: "scalar", fullName: getTypeFullName(program, type), namespace });
}

function collectModelDependencies(
  program: Program,
  type: Extract<Type, { kind: "Model" }>,
  push: (dependency: NormalizedDependency) => void,
  visited: Set<Type>,
): void {
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

function pushRelationDependency(
  program: Program,
  normalized: NormalizedOrmModel,
  prop: ModelProperty,
  push: (dependency: NormalizedDependency) => void,
): boolean {
  const relation = resolveRelation(program, prop, normalized.model);
  if (!relation) {
    return false;
  }

  const dependency = createDependencyFromRelation(program, relation.targetModel);
  if (dependency) {
    push(dependency);
  }
  return true;
}

function reportUnsupportedRelationShape(
  program: Program,
  normalized: NormalizedOrmModel,
  prop: ModelProperty,
): void {
  if (normalized.kind === "data") {
    return;
  }

  const relationLike = relationLikeType(program, prop.type);
  const hasRelationDecorators =
    !!getForeignKeyConfig(program, prop) ||
    !!getMappedBy(program, prop) ||
    !!getManyToMany(program, prop);
  if (!relationLike || hasRelationDecorators) {
    return;
  }

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
