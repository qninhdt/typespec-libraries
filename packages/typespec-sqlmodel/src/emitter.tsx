/**
 * TypeSpec emitter that generates namespace-grouped SQLModel / Pydantic files.
 */
import { render, writeOutput, SourceFile, SourceDirectory } from "@alloy-js/core";
import type { EmitContext } from "@typespec/compiler";
import { camelToSnake, normalizeOrmGraph, selectModelsForEmitter } from "@qninhdt/typespec-orm";
import { generateInit } from "./components/PyConstants.js";
import { PyDataFile } from "./components/PyDataModel.jsx";
import { PyModelFile } from "./components/PyModel.jsx";
import { reportDiagnostic, type SqlModelEmitterOptions } from "./lib.js";

export async function emit(context: EmitContext<SqlModelEmitterOptions>): Promise<void> {
  const { program } = context;
  const options = context.options;
  const outputDir = options["output-dir"] ?? context.emitterOutputDir;
  const isStandalone = options.standalone ?? false;
  const libraryName = options["library-name"];

  if (isStandalone && !libraryName) {
    reportDiagnostic(program, {
      code: "standalone-requires-library-name",
      target: program.getGlobalNamespaceType(),
    });
    return;
  }

  const graph = normalizeOrmGraph(program);
  const selection = selectModelsForEmitter(program, graph, {
    include: options.include,
    exclude: options.exclude,
    kinds: ["table", "data"],
  });
  const tables = selection.models.filter((model) => model.kind === "table");
  const dataModels = selection.models.filter((model) => model.kind === "data");

  if (tables.length === 0 && dataModels.length === 0) {
    reportDiagnostic(program, {
      code: "no-tables-found",
      target: program.getGlobalNamespaceType(),
    });
    return;
  }

  const namespaceGroups = [...selection.byNamespace.values()].sort((a, b) =>
    a[0].namespace.localeCompare(b[0].namespace),
  );
  const packageInitContent = new Map<string, string>();

  for (const models of namespaceGroups) {
    const modelNames = models.map((model) => model.model.name);
    const moduleFiles = models.map((model) => camelToSnake(model.model.name));
    packageInitContent.set(
      models[0].namespaceDir,
      generateInit(modelNames, moduleFiles, models[0].namespace),
    );
  }

  const packageDirs = new Set<string>();
  for (const model of selection.models) {
    for (let i = 1; i <= model.namespacePath.length; i++) {
      packageDirs.add(model.namespacePath.slice(0, i).join("/"));
    }
  }

  const tree = (
    <SourceDirectory path=".">
      {isStandalone && (
        <SourceFile path="pyproject.toml" filetype="toml" printWidth={9999}>
          {`[project]
name = "${libraryName}"
version = "0.0.0"
description = "Generated SQLModel classes"
requires-python = ">=3.10"
dependencies = [
    "sqlmodel>=0.0.14",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = [` +
            selection.topLevelNamespaces.map((item) => `"${item}"`).join(", ") +
            `]
`}
        </SourceFile>
      )}
      {[...packageDirs].sort().map((dir) => (
        <SourceDirectory path={dir}>
          <SourceFile path="__init__.py" filetype="py" printWidth={9999}>
            {packageInitContent.get(dir) ?? ""}
          </SourceFile>
        </SourceDirectory>
      ))}
      {namespaceGroups.map((models) => (
        <SourceDirectory path={models[0].namespaceDir}>
          {models
            .filter((model) => model.kind === "table")
            .map((model) => (
              <PyModelFile program={program} normalizedModel={model} modelLookup={graph.byModel} />
            ))}
          {models
            .filter((model) => model.kind === "data")
            .map((model) => (
              <PyDataFile program={program} model={model.model} label={model.label ?? model.name} />
            ))}
        </SourceDirectory>
      ))}
    </SourceDirectory>
  );

  const output = render(tree);
  await writeOutput(output, outputDir);
}
