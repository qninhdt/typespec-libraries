import { render, SourceDirectory, SourceFile, type OutputDirectory } from "@alloy-js/core";
import type { Program, Scalar } from "@typespec/compiler";
import { TypeSpecSqlModelTestLibrary } from "../src/testing/index.js";
import {
  createTestRunner as sharedCreateTestRunner,
  createEmitterTestRunner as sharedCreateEmitterTestRunner,
  getOutputFileContent,
  expectFileContains,
} from "@qninhdt/typespec-orm/testing";
import {
  camelToSnake,
  normalizeOrmGraph,
  selectModelsForEmitter,
  type NormalizedOrmModel,
} from "@qninhdt/typespec-orm";
import { PyModelFile } from "../src/components/PyModel.jsx";
import { PyDataFile } from "../src/components/PyDataModel.jsx";
import { generateInit } from "../src/components/PyConstants.js";
import {
  buildPythonScalarAliasNames,
  collectAliasableScalarsForModels,
  PyScalarsFile,
} from "../src/components/PyScalars.jsx";
import { expect } from "vitest";
import type { SqlModelEmitterOptions } from "../src/lib.js";

interface ScalarGroup {
  topLevel: string;
  scalars: Scalar[];
  aliasNames: Map<Scalar, string>;
}

const LIBRARIES = [TypeSpecSqlModelTestLibrary];

export async function createTestRunner() {
  return sharedCreateTestRunner(LIBRARIES);
}

export async function createEmitterTestRunner(emitterOptions?: Record<string, unknown>) {
  return sharedCreateEmitterTestRunner({
    libraries: LIBRARIES,
    emitterName: "@qninhdt/typespec-sqlmodel",
    emitterOptions,
  });
}

export async function emitPyFile(
  code: string,
  fileName: string,
  moduleName = "models",
  emitterOptions: SqlModelEmitterOptions = {},
): Promise<string> {
  const output = await renderPyOutput(code, moduleName, emitterOptions);
  return getOutputFileContent(output, fileName);
}

export async function renderPyOutput(
  code: string,
  moduleName = "models",
  emitterOptions: SqlModelEmitterOptions = {},
): Promise<OutputDirectory> {
  const runner = await createTestRunner();
  await runner.compile(code);

  const diags = runner.program.diagnostics.filter((d) => d.severity === "error");
  expect(
    diags,
    `TypeSpec compilation errors: ${diags.map((d) => d.message).join("; ")}`,
  ).toHaveLength(0);

  const program = runner.program;
  const graph = normalizeOrmGraph(program);
  const selection = selectModelsForEmitter(program, graph, {
    kinds: ["table", "mixin", "data"],
  });
  const tables = selection.models.filter((model) => model.kind === "table");
  const mixins = selection.models.filter((model) => model.kind === "mixin");
  const dataModels = selection.models.filter((model) => model.kind === "data");
  const namespaceGroups = [...selection.byNamespace.values()];
  const scalarGroups = buildScalarGroups(program, selection.models);
  const scalarGroupsByTopLevel = new Map(scalarGroups.map((group) => [group.topLevel, group]));
  const isStandalone = emitterOptions.standalone ?? false;
  const libraryName = emitterOptions["library-name"] ?? moduleName;

  const allModelNames: string[] = [];
  const moduleFiles: string[] = [];
  for (const model of tables) {
    allModelNames.push(model.model.name);
    moduleFiles.push(camelToSnake(model.model.name));
  }
  for (const model of mixins) {
    allModelNames.push(model.model.name);
    moduleFiles.push(camelToSnake(model.model.name));
  }
  for (const model of dataModels) {
    allModelNames.push(model.model.name);
    moduleFiles.push(camelToSnake(model.model.name));
  }
  const initContent = generateInit({
    moduleName,
    models: allModelNames.map((name, index) => ({
      name,
      moduleFile: moduleFiles[index],
    })),
  });

  const tree = (
    <SourceDirectory path=".">
      {isStandalone && (
        <SourceFile path="pyproject.toml" filetype="toml" printWidth={9999}>
          {`[project]
name = "${libraryName}"
version = "0.0.0"
`}
        </SourceFile>
      )}
      {scalarGroups.map((group) => (
        <SourceDirectory path={group.topLevel || "."}>
          <PyScalarsFile program={program} scalars={group.scalars} aliasNames={group.aliasNames} />
        </SourceDirectory>
      ))}
      {namespaceGroups.map((models) => (
        <SourceDirectory path={models[0].namespaceDir}>
          {models
            .filter((model) => model.kind === "table")
            .map((model) => (
              <PyModelFile
                program={program}
                normalizedModel={model}
                modelLookup={graph.byModel}
                collectionStrategy={emitterOptions["collection-strategy"]}
                scalarAliasNames={
                  scalarGroupsByTopLevel.get(model.namespacePath[0] ?? "")?.aliasNames
                }
              />
            ))}
          {models
            .filter((model) => model.kind === "mixin")
            .map((model) => (
              <PyModelFile
                program={program}
                normalizedModel={model}
                modelLookup={graph.byModel}
                collectionStrategy={emitterOptions["collection-strategy"]}
                scalarAliasNames={
                  scalarGroupsByTopLevel.get(model.namespacePath[0] ?? "")?.aliasNames
                }
              />
            ))}
          {models
            .filter((model) => model.kind === "data")
            .map((model) => (
              <PyDataFile
                program={program}
                model={model.model}
                label={model.label ?? model.name}
                normalizedModel={model}
                modelLookup={graph.byModel}
                scalarAliasNames={
                  scalarGroupsByTopLevel.get(model.namespacePath[0] ?? "")?.aliasNames
                }
              />
            ))}
          <SourceFile path="__init__.py" filetype="py" printWidth={9999}>
            {initContent}
          </SourceFile>
        </SourceDirectory>
      ))}
    </SourceDirectory>
  );

  return render(tree);
}

function buildScalarGroups(program: Program, models: NormalizedOrmModel[]): ScalarGroup[] {
  const byTopLevel = new Map<string, NormalizedOrmModel[]>();
  for (const model of models) {
    const topLevel = model.namespacePath[0] ?? "";
    const group = byTopLevel.get(topLevel) ?? [];
    group.push(model);
    byTopLevel.set(topLevel, group);
  }

  return [...byTopLevel.entries()].map(([topLevel, groupModels]) => {
    const scalars = collectAliasableScalarsForModels(
      program,
      groupModels.map((model) => model.model),
    );
    return {
      topLevel,
      scalars,
      aliasNames: buildPythonScalarAliasNames(program, scalars),
    };
  });
}

export async function expectPyFileContains(
  code: string,
  fileName: string,
  ...substrings: string[]
): Promise<void> {
  const output = await renderPyOutput(code);
  expectFileContains(output, fileName, ...substrings);
}
