import type { EmitContext, Program } from "@typespec/compiler";
import {
  normalizeOrmGraph,
  selectModelsForEmitter,
  type NormalizedOrmGraph,
  type NormalizedOrmModel,
  type OrmEmitterSelection,
} from "./normalization.js";

export interface EmitterBootstrapConfig {
  kinds: Array<"table" | "data" | "mixin">;
  include?: string[];
  exclude?: string[];
  standalone?: boolean;
  libraryName?: string;
}

export interface EmitterBootstrapResult {
  program: Program;
  graph: NormalizedOrmGraph;
  selection: OrmEmitterSelection;
  namespaceGroups: NormalizedOrmModel[][];
  isStandalone: boolean;
  libraryName: string | undefined;
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
  };
}

export function isBootstrapSuccess(
  result: EmitterBootstrapResult | BootstrapFailure,
): result is EmitterBootstrapResult {
  return "program" in result;
}
