import type { EmitContext, Program } from "@typespec/compiler";
import {
  normalizeOrmGraph,
  selectModelsForEmitter,
  type NormalizedOrmGraph,
  type NormalizedOrmModel,
  type OrmEmitterSelection,
} from "./normalization.js";

export type Dialect = "postgres" | "mysql" | "sqlite";

export interface EmitterBootstrapConfig {
  kinds: Array<"table" | "data" | "mixin">;
  include?: string[];
  exclude?: string[];
  standalone?: boolean;
  libraryName?: string;
  dialect?: Dialect;
}

export interface EmitterBootstrapResult {
  program: Program;
  graph: NormalizedOrmGraph;
  selection: OrmEmitterSelection;
  namespaceGroups: NormalizedOrmModel[][];
  isStandalone: boolean;
  libraryName: string | undefined;
  dialect: Dialect;
}

export type BootstrapFailure =
  | { reason: "standalone-requires-library-name" }
  | { reason: "no-models-found" };

export function bootstrapEmitter<T extends object>(
  context: EmitContext<T>,
  config: EmitterBootstrapConfig,
): EmitterBootstrapResult | BootstrapFailure {
  const { program } = context;
  const isStandalone = config.standalone ?? false;

  if (isStandalone && !config.libraryName) {
    return { reason: "standalone-requires-library-name" };
  }

  const graph = normalizeOrmGraph(program);
  const selection = selectModelsForEmitter(program, graph, {
    include: config.include,
    exclude: config.exclude,
    kinds: config.kinds,
  });

  if (selection.models.length === 0) {
    return { reason: "no-models-found" };
  }

  const namespaceGroups = [...selection.byNamespace.values()].sort((a, b) =>
    a[0].namespace.localeCompare(b[0].namespace),
  );

  return {
    program,
    graph,
    selection,
    namespaceGroups,
    isStandalone,
    libraryName: config.libraryName,
    dialect: config.dialect ?? "postgres",
  };
}

export function isBootstrapSuccess(
  result: EmitterBootstrapResult | BootstrapFailure,
): result is EmitterBootstrapResult {
  return "program" in result;
}
