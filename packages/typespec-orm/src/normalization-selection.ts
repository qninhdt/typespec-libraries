import type { Program } from "@typespec/compiler";
import { ScopesKey, reportDiagnostic } from "./lib.js";
import {
  type NormalizedOrmGraph,
  type NormalizedOrmModel,
  type OrmEmitterSelection,
  type OrmSelector,
  type SelectionOptions,
} from "./normalization-types.js";
import type { Model } from "@typespec/compiler";

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

function selectorMatches(
  selector: OrmSelector,
  fullName: string,
  namespace: string | undefined,
  tags: string[],
): boolean {
  if (selector.kind === "tag") {
    return tags.includes(selector.value);
  }
  return selectorMatchesName(selector.raw, fullName, namespace);
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
    const tags = getModelScopes(program, model.model);
    return isDeclarationSelected(model.fullName, model.namespace, tags, include, exclude);
  });

  if (options.autoIncludeDependencies) {
    const seen = new Set(selected.map((model) => model.fullName));
    const queue = [...selected];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const dependency of current.dependencies) {
        if (dependency.fullName === current.fullName) continue;
        if (seen.has(dependency.fullName)) continue;
        const depModel = graph.models.find((entry) => entry.fullName === dependency.fullName);
        if (!depModel) continue;
        if (!options.kinds.includes(depModel.kind)) continue;
        seen.add(depModel.fullName);
        selected.push(depModel);
        queue.push(depModel);
      }
    }
    selected.sort((a, b) => a.fullName.localeCompare(b.fullName));
  } else {
    for (const model of selected) {
      for (const dependency of model.dependencies) {
        if (dependency.fullName === model.fullName) continue;
        const depGraphModel = graph.models.find((entry) => entry.fullName === dependency.fullName);
        const depTags = depGraphModel ? getModelScopes(program, depGraphModel.model) : [];
        if (
          !isDeclarationSelected(
            dependency.fullName,
            dependency.namespace,
            depTags,
            include,
            exclude,
          )
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
    .filter((segment): segment is string => Boolean(segment))
    .sort((left, right) => left.localeCompare(right));

  return { models: selected, byNamespace, topLevelNamespaces };
}

function normalizeSelectors(values: string[] | undefined): OrmSelector[] {
  return (values ?? [])
    .map((value) => value.trim())
    .filter((value) => value !== "")
    .map((raw) => {
      if (raw.startsWith("#")) {
        return { raw, kind: "tag", value: raw.slice(1) } as const;
      }
      return { raw, kind: "name" } as const;
    });
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

  // Per-list dedup pass: warn on exact-string duplicates within include / exclude.
  // Catches `["#frontend", "#frontend"]` which `selectorMatchesName` does not flag.
  for (const [list, label] of [
    [include, "include"],
    [exclude, "exclude"],
  ] as const) {
    const seen = new Set<string>();
    const reported = new Set<string>();
    for (const selector of list) {
      if (seen.has(selector.raw)) {
        if (!reported.has(selector.raw)) {
          reported.add(selector.raw);
          reportDiagnostic(program, {
            code: "redundant-include-selector",
            target: program.getGlobalNamespaceType(),
            format: { selector: selector.raw, list: label },
          });
        }
      } else {
        seen.add(selector.raw);
      }
    }
  }

  for (const selectors of [include, exclude]) {
    const sorted = [...selectors].sort((a, b) => a.raw.length - b.raw.length);
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        if (sorted[i].raw === sorted[j].raw) continue;
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

  reportUnusedScopes(program, include, exclude);
}

function reportUnusedScopes(
  program: Program,
  include: OrmSelector[],
  exclude: OrmSelector[],
): void {
  const referenced = new Set<string>();
  for (const selectors of [include, exclude]) {
    for (const selector of selectors) {
      if (selector.kind === "tag") referenced.add(selector.value);
    }
  }

  const declared = new Set<string>();
  for (const [, scopes] of program.stateMap(ScopesKey)) {
    if (Array.isArray(scopes)) {
      for (const value of scopes as unknown[]) {
        if (typeof value === "string") declared.add(value);
      }
    }
  }

  const reported = new Set<string>();
  for (const scope of declared) {
    if (referenced.has(scope) || reported.has(scope)) continue;
    reported.add(scope);
    reportDiagnostic(program, {
      code: "unused-scope",
      target: program.getGlobalNamespaceType(),
      format: { scope },
    });
  }
}

function isDeclarationSelected(
  fullName: string,
  namespace: string | undefined,
  tags: string[],
  include: OrmSelector[],
  exclude: OrmSelector[],
): boolean {
  const included =
    include.length === 0 ||
    include.some((selector) => selectorMatches(selector, fullName, namespace, tags));
  if (!included) {
    return false;
  }
  return !exclude.some((selector) => selectorMatches(selector, fullName, namespace, tags));
}

function getModelScopes(program: Program, model: Model): string[] {
  return (program.stateMap(ScopesKey).get(model) as string[] | undefined) ?? [];
}
