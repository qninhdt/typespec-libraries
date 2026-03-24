/**
 * Test utilities for the Zod emitter.
 */

import {
  render,
  SourceDirectory,
  type OutputDirectory,
  type ContentOutputFile,
} from "@alloy-js/core";
import { Output } from "@typespec/emitter-framework";
import {
  createTestHost as coreCreateTestHost,
  createTestWrapper,
} from "@typespec/compiler/testing";
import { TypeSpecOrmTestLibrary } from "@qninhdt/typespec-orm/testing";
import { TypeSpecZodTestLibrary } from "../src/testing/index.js";
import { collectDataModels } from "@qninhdt/typespec-orm";
import { newTopologicalTypeCollector } from "../src/utils.jsx";
import { ZodModelFile } from "../src/components/ZodModelFile.jsx";
import { ZodSchemaDeclaration } from "../src/components/ZodSchemaDeclaration.jsx";
import { zod } from "../src/external-packages/zod.js";
import { expect } from "vitest";

export async function createTestHost() {
  return coreCreateTestHost({
    libraries: [TypeSpecOrmTestLibrary],
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
  const host = await coreCreateTestHost({
    libraries: [TypeSpecOrmTestLibrary, TypeSpecZodTestLibrary],
  });

  return createTestWrapper(host, {
    wrapper: (code) =>
      `import "@qninhdt/typespec-orm"; using Qninhdt.Orm;\nnamespace Test {\n${code}\n}`,
    compilerOptions: {
      emit: ["@qninhdt/typespec-zod"],
      options: {
        "@qninhdt/typespec-zod": { ...emitterOptions },
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
export async function emitZodFile(
  code: string,
  fileName: string,
  pathPrefix: string | boolean = false,
): Promise<string> {
  const runner = await createTestRunner();
  await runner.compile(code);

  const diags = runner.program.diagnostics.filter((d) => d.severity === "error");
  expect(
    diags,
    `TypeSpec compilation errors: ${diags.map((d) => d.message).join("; ")}`,
  ).toHaveLength(0);

  const program = runner.program;
  const dataModels = collectDataModels(program);

  // Collect all referenced types (enums, etc.) that need to be declared
  const collector = newTopologicalTypeCollector(program);
  for (const { model } of dataModels) {
    collector.collectType(model);
  }

  const declarations = collector.types.filter((t) => t.kind === "Enum" || t.kind === "Model");

  const tree = (
    <Output program={program} externals={[zod]}>
      <SourceDirectory path=".">
        {declarations.map((type) => {
          if (type.kind === "Enum") {
            return <ZodSchemaDeclaration type={type} name={type.name + "Schema"} export />;
          }
          return null;
        })}
        {dataModels.map(({ model, label }) =>
          (() => {
            let path: string;
            if (typeof pathPrefix === "string") {
              path = `${pathPrefix}/${model.name}.ts`;
            } else if (pathPrefix) {
              path = `models/${model.name}.ts`;
            } else {
              path = `${model.name}.ts`;
            }

            return <ZodModelFile program={program} model={model} label={label} path={path} />;
          })(),
        )}
      </SourceDirectory>
    </Output>
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

/**
 * Assert that the generated Zod file contains the given substrings.
 */
export async function expectZodFileContains(
  code: string,
  fileName: string,
  ...substrings: string[]
): Promise<void> {
  const actual = await emitZodFile(code, fileName);
  for (const sub of substrings) {
    expect(actual, `Expected "${fileName}" to contain:\n${sub}\n\nActual:\n${actual}`).toContain(
      sub,
    );
  }
}
