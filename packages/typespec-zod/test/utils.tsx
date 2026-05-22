import { render, SourceDirectory, type OutputDirectory } from "@alloy-js/core";
import { Output } from "@typespec/emitter-framework";
import { TypeSpecZodTestLibrary } from "../src/testing/index.js";
import {
  createTestRunner as sharedCreateTestRunner,
  createEmitterTestRunner as sharedCreateEmitterTestRunner,
  getOutputFileContent,
  expectFileContains,
} from "@qninhdt/typespec-orm/testing";
import { normalizeOrmGraph, selectModelsForEmitter } from "@qninhdt/typespec-orm";
import { ZodModelFile } from "../src/components/ZodModelFile.jsx";
import { collectScalarsForModels, ZodScalarsFile } from "../src/components/ZodScalarsFile.jsx";
import { zod } from "../src/external-packages/zod.js";
import { expect } from "vitest";

const LIBRARIES = [TypeSpecZodTestLibrary];

export async function createTestRunner() {
  return sharedCreateTestRunner(LIBRARIES);
}

export async function createEmitterTestRunner(emitterOptions?: Record<string, unknown>) {
  return sharedCreateEmitterTestRunner({
    libraries: LIBRARIES,
    emitterName: "@qninhdt/typespec-zod",
    emitterOptions,
  });
}

export async function emitZodFile(
  code: string,
  fileName: string,
  pathPrefix: string | boolean = false,
): Promise<string> {
  const output = await renderZodOutput(code, pathPrefix);
  return getOutputFileContent(output, fileName);
}

export async function renderZodOutput(
  code: string,
  pathPrefix: string | boolean = false,
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
    kinds: ["mixin", "data"],
  });
  const dataModels = selection.models;

  const tree = (
    <Output program={program} externals={[zod]}>
      <SourceDirectory path=".">
        <ZodScalarsFile
          program={program}
          scalars={collectScalarsForModels(
            program,
            dataModels.map(({ model }) => model),
          )}
        />
        {dataModels.map(({ model, label }) => {
          const directory =
            typeof pathPrefix === "string" ? pathPrefix : pathPrefix ? "models" : "";
          const file = (
            <ZodModelFile
              program={program}
              model={model}
              label={label ?? model.name}
              path={`${model.name}.ts`}
            />
          );

          return directory ? <SourceDirectory path={directory}>{file}</SourceDirectory> : file;
        })}
      </SourceDirectory>
    </Output>
  );

  return render(tree);
}

export async function expectZodFileContains(
  code: string,
  fileName: string,
  ...substrings: string[]
): Promise<void> {
  const output = await renderZodOutput(code);
  expectFileContains(output, fileName, ...substrings);
}
