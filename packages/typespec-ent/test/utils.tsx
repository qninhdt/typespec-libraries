import { render, SourceDirectory, type OutputDirectory } from "@alloy-js/core";
import { expect } from "vitest";
import {
  createEmitterTestRunner as sharedCreateEmitterTestRunner,
  createTestRunner as sharedCreateTestRunner,
  expectFileContains,
  getOutputFileContent,
} from "@qninhdt/typespec-orm/testing";
import { normalizeOrmGraph, selectModelsForEmitter } from "@qninhdt/typespec-orm";
import { EntModelFile } from "../src/components/EntSchema.jsx";
import { EntDataFile } from "../src/components/EntDataStruct.jsx";
import { TypeSpecEntTestLibrary } from "../src/testing/index.js";
import type { EntEmitterOptions } from "../src/lib.js";

const LIBRARIES = [TypeSpecEntTestLibrary];

export async function createTestRunner() {
  return sharedCreateTestRunner(LIBRARIES);
}

export async function createEmitterTestRunner(emitterOptions?: Record<string, unknown>) {
  return sharedCreateEmitterTestRunner({
    libraries: LIBRARIES,
    emitterName: "@qninhdt/typespec-ent",
    emitterOptions,
  });
}

export async function emitGoFile(
  code: string,
  fileName: string,
  packageName = "test",
  emitterOptions: EntEmitterOptions = {},
): Promise<string> {
  const output = await renderGoOutput(code, packageName, emitterOptions);
  return getOutputFileContent(output, fileName);
}

export async function renderGoOutput(
  code: string,
  packageName = "test",
  emitterOptions: EntEmitterOptions = {},
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
  const namespaceGroups = [...selection.byNamespace.values()];
  const schemaModels = selection.models.filter(
    (model) => model.kind === "table" || model.kind === "mixin",
  );
  const libraryName = emitterOptions["library-name"] ?? "github.com/test/library";

  const tree = (
    <SourceDirectory path=".">
      <SourceDirectory path="ent/schema">
        {schemaModels.map((model) => (
          <EntModelFile
            program={program}
            normalizedModel={model}
            modelLookup={graph.byModel}
            collectionStrategy={emitterOptions["collection-strategy"]}
          />
        ))}
      </SourceDirectory>
      {namespaceGroups.map((models) => (
        <SourceDirectory path={models[0].namespaceDir}>
          {models
            .filter((model) => model.kind === "data")
            .map((model) => (
              <EntDataFile
                program={program}
                model={model.model}
                label={model.label ?? model.name}
                packageName={model.namespacePath.length > 0 ? model.packageName : packageName}
                normalizedModel={model}
                modelLookup={graph.byModel}
                libraryName={libraryName}
              />
            ))}
        </SourceDirectory>
      ))}
    </SourceDirectory>
  );

  return render(tree);
}

export async function expectGoFileContains(
  code: string,
  fileName: string,
  ...substrings: string[]
): Promise<void> {
  const output = await renderGoOutput(code);
  expectFileContains(output, fileName, ...substrings);
}
