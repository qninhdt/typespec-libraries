import {
  render,
  SourceDirectory,
  type OutputDirectory,
  type ContentOutputFile,
} from "@alloy-js/core";
import {
  createTestHost as coreCreateTestHost,
  createTestWrapper,
} from "@typespec/compiler/testing";
import { TypeSpecOrmTestLibrary } from "@qninhdt/typespec-orm/testing";
import { TypeSpecGormTestLibrary } from "../src/testing/index.js";
import { collectTableModels, collectDataModels } from "@qninhdt/typespec-orm";
import { GormModelFile } from "../src/components/GormStruct.jsx";
import { GormDataFile } from "../src/components/GormDataStruct.jsx";
import { expect } from "vitest";

export async function createTestHost() {
  return coreCreateTestHost({
    libraries: [TypeSpecOrmTestLibrary, TypeSpecGormTestLibrary],
  });
}

export async function createTestRunner() {
  const host = await createTestHost();
  return createTestWrapper(host, {
    wrapper: (code) => `import "@qninhdt/typespec-orm"; using Qninhdt.Orm;\n${code}`,
  });
}

export async function createEmitterTestRunner(emitterOptions?: Record<string, unknown>) {
  const host = await createTestHost();
  return createTestWrapper(host, {
    wrapper: (code) => `import "@qninhdt/typespec-orm"; using Qninhdt.Orm;\n${code}`,
    compilerOptions: {
      emit: ["@qninhdt/typespec-gorm"],
      options: {
        "@qninhdt/typespec-gorm": { ...emitterOptions },
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

/**
 * Compile TypeSpec, build JSX tree, render in memory, and return a specific file's content.
 */
export async function emitGoFile(
  code: string,
  fileName: string,
  packageName = "models",
): Promise<string> {
  const runner = await createTestRunner();
  await runner.compile(code);

  const diags = runner.program.diagnostics.filter((d) => d.severity === "error");
  expect(
    diags,
    `TypeSpec compilation errors: ${diags.map((d) => d.message).join("; ")}`,
  ).toHaveLength(0);

  const program = runner.program;
  const tables = collectTableModels(program);
  const dataModels = collectDataModels(program);

  const tree = (
    <SourceDirectory path=".">
      {tables.map(({ model, tableName }) => (
        <GormModelFile
          program={program}
          model={model}
          tableName={tableName}
          packageName={packageName}
        />
      ))}
      {dataModels.map(({ model, label }) => (
        <GormDataFile program={program} model={model} label={label} packageName={packageName} />
      ))}
    </SourceDirectory>
  );

  const output = render(tree);

  const file = findOutputFile(output, fileName);
  if (!file) {
    const available = listAllFiles(output);
    throw new Error(
      `File "${fileName}" not found in output. Available files: ${available.join(", ")}`,
    );
  }
  return file.contents;
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
 * Assert that the generated Go file contains the given substrings.
 */
export async function expectGoFileContains(
  code: string,
  fileName: string,
  ...substrings: string[]
): Promise<void> {
  const actual = await emitGoFile(code, fileName);
  for (const sub of substrings) {
    expect(actual, `Expected "${fileName}" to contain:\n${sub}\n\nActual:\n${actual}`).toContain(
      sub,
    );
  }
}
