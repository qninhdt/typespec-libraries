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
import { ZodMetaFile } from "../src/components/ZodMetaFile.jsx";
import { collectScalarsForModels, ZodScalarsFile } from "../src/components/ZodScalarsFile.jsx";
import { zod } from "../src/external-packages/zod.js";
import type { ZodEmitterOptions } from "../src/lib.js";
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

export interface RenderOptions {
  readonly pathPrefix?: string | boolean;
  readonly emitterOptions?: ZodEmitterOptions;
}

export async function emitZodFile(
  code: string,
  fileName: string,
  pathPrefix: string | boolean = false,
  emitterOptions?: ZodEmitterOptions,
): Promise<string> {
  const output = await renderZodOutput(code, pathPrefix, emitterOptions);
  return getOutputFileContent(output, fileName);
}

export async function renderZodOutput(
  code: string,
  pathPrefix: string | boolean = false,
  emitterOptions?: ZodEmitterOptions,
): Promise<OutputDirectory> {
  const runner = await createTestRunner();
  await runner.compile(code);

  const diags = runner.program.diagnostics.filter((d) => d.severity === "error");
  expect(
    diags,
    `TypeSpec compilation errors: ${diags.map((d) => d.message).join("; ")}`,
  ).toHaveLength(0);

  const program = runner.program;
  // Stash emitter options on the program so getZodOptions() picks them up.
  // Cast through `any` because the Program's `compilerOptions` shape is
  // narrower than the test stub our zod-options reader expects.
  if (emitterOptions) {
    const stub = program as unknown as {
      compilerOptions?: {
        options?: Record<string, unknown>;
      };
    };
    stub.compilerOptions = {
      ...(stub.compilerOptions ?? {}),
      options: {
        ...(stub.compilerOptions?.options ?? {}),
        "@qninhdt/typespec-zod": emitterOptions as unknown as Record<string, unknown>,
      },
    };
  }
  const graph = normalizeOrmGraph(program);
  const selection = selectModelsForEmitter(program, graph, {
    kinds: ["mixin", "data"],
  });
  const dataModels = selection.models;

  const tree = (
    <Output program={program} externals={[zod]}>
      <SourceDirectory path=".">
        <ZodMetaFile />
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
