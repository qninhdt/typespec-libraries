import {
  render,
  SourceDirectory,
  SourceFile,
  type OutputDirectory,
  type ContentOutputFile,
} from "@alloy-js/core";
import {
  createTestHost as coreCreateTestHost,
  createTestWrapper,
} from "@typespec/compiler/testing";
import { TypeSpecOrmTestLibrary } from "@qninhdt/typespec-orm/testing";
import { TypeSpecSqlModelTestLibrary } from "../src/testing/index.js";
import { camelToSnake, normalizeOrmGraph, selectModelsForEmitter } from "@qninhdt/typespec-orm";
import { PyModelFile } from "../src/components/PyModel.jsx";
import { PyDataFile } from "../src/components/PyDataModel.jsx";
import { generateInit } from "../src/components/PyConstants.js";
import { expect } from "vitest";
import type { SqlModelEmitterOptions } from "../src/lib.js";

export async function createTestHost() {
  return coreCreateTestHost({
    libraries: [TypeSpecOrmTestLibrary, TypeSpecSqlModelTestLibrary],
  });
}

export async function createTestRunner() {
  const host = await createTestHost();
  return createTestWrapper(host, {
    wrapper: (code) =>
      `import "@qninhdt/typespec-orm"; using Qninhdt.Orm;\nnamespace Test {\n${code}\n}`,
  });
}

export async function createEmitterTestRunner(emitterOptions?: Record<string, unknown>) {
  const host = await createTestHost();
  return createTestWrapper(host, {
    wrapper: (code) =>
      `import "@qninhdt/typespec-orm"; using Qninhdt.Orm;\nnamespace Test {\n${code}\n}`,
    compilerOptions: {
      emit: ["@qninhdt/typespec-sqlmodel"],
      options: {
        "@qninhdt/typespec-sqlmodel": { ...emitterOptions },
      },
    },
  });
}

// ─── Output Assertion Utilities ──────────────────────────────────────────────

/**
 * Find a ContentOutputFile by filename in the rendered output tree.
 */
function findOutputFile(dir: OutputDirectory, fileName: string): ContentOutputFile | undefined {
  for (const item of dir.contents) {
    if (item.kind === "file" && "contents" in item && item.path.endsWith(fileName)) {
      return item as ContentOutputFile;
    }
    if (item.kind === "directory") {
      const found = findOutputFile(item, fileName);
      if (found) return found;
    }
  }
  return undefined;
}

function listAllFiles(dir: OutputDirectory): string[] {
  const files: string[] = [];
  for (const item of dir.contents) {
    if (item.kind === "file") files.push(item.path);
    if (item.kind === "directory") files.push(...listAllFiles(item));
  }
  return files;
}

/**
 * Compile TypeSpec, build JSX tree, render in memory, and return a specific file's content.
 */
export async function emitPyFile(
  code: string,
  fileName: string,
  moduleName = "models",
  emitterOptions: SqlModelEmitterOptions = {},
): Promise<string> {
  const output = await renderPyOutput(code, moduleName, emitterOptions);

  const file = findOutputFile(output, fileName);
  if (!file) {
    const available = listAllFiles(output);
    throw new Error(
      `File "${fileName}" not found in output. Available files: ${available.join(", ")}`,
    );
  }
  return file.contents;
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
    kinds: ["table", "data"],
  });
  const tables = selection.models.filter((model) => model.kind === "table");
  const dataModels = selection.models.filter((model) => model.kind === "data");
  const namespaceGroups = [...selection.byNamespace.values()];
  const isStandalone = emitterOptions.standalone ?? false;
  const libraryName = emitterOptions["library-name"] ?? moduleName;

  const allModelNames: string[] = [];
  const moduleFiles: string[] = [];
  for (const model of tables) {
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
              />
            ))}
          {models
            .filter((model) => model.kind === "data")
            .map((model) => (
              <PyDataFile program={program} model={model.model} label={model.label ?? model.name} />
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

/**
 * Assert that the generated Python file contains the given substrings.
 */
export async function expectPyFileContains(
  code: string,
  fileName: string,
  ...substrings: string[]
): Promise<void> {
  const actual = await emitPyFile(code, fileName);
  for (const sub of substrings) {
    expect(actual, `Expected "${fileName}" to contain:\n${sub}\n\nActual:\n${actual}`).toContain(
      sub,
    );
  }
}
