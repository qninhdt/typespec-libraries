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
import type { Model } from "@typespec/compiler";
import {
  createTestHost as coreCreateTestHost,
  createTestWrapper,
} from "@typespec/compiler/testing";
import { TypeSpecOrmTestLibrary } from "@qninhdt/typespec-orm/testing";
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
    wrapper: (code) => `import "@qninhdt/typespec-orm"; using Qninhdt.Orm;\n${code}`,
  });
}

export async function createEmitterTestRunner(emitterOptions?: Record<string, unknown>) {
  const { resolvePath } = await import("@typespec/compiler");

  const host = await coreCreateTestHost({
    libraries: [
      TypeSpecOrmTestLibrary,
      {
        name: "@qninhdt/typespec-zod",
        packageRoot: "/home/qninh/projects/typespec-libraries/packages/typespec-zod",
        files: [
          {
            realDir: "",
            pattern: "package.json",
            virtualPath: "./node_modules/@qninhdt/typespec-zod",
          },
          {
            realDir: "dist/src",
            pattern: "**/*.js",
            virtualPath: resolvePath("./node_modules/@qninhdt/typespec-zod", "dist/src"),
          },
        ],
      },
    ],
  });

  return createTestWrapper(host, {
    wrapper: (code) => `import "@qninhdt/typespec-orm"; using Qninhdt.Orm;\n${code}`,
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
 * Converts a string to PascalCase
 */
function toPascalCase(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).replace(/[-_](.)/g, (_, c) => c.toUpperCase());
}

/**
 * Add type aliases (e.g., `export type User = z.infer<typeof UserSchema>`) to rendered output.
 * This mimics what the emitter does via writeFileSync after writeOutput.
 */
function addTypeAliases(content: string, dataModels: { model: Model; label: string }[]): string {
  const aliases = dataModels
    .map(({ model }) => {
      const name = model.name;
      const pascalName = toPascalCase(name);
      return `export type ${pascalName} = z.infer<typeof ${pascalName}Schema>;`;
    })
    .join("\n");

  return content.trim() + "\n" + aliases + "\n";
}

/**
 * Compile TypeSpec, build JSX tree, render in memory, and return a specific file's content.
 */
export async function emitZodFile(
  code: string,
  fileName: string,
  modelsFolder = false,
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
        {dataModels.map(({ model, label }) => (
          <ZodModelFile program={program} model={model} label={label} modelsFolder={modelsFolder} />
        ))}
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

  let content = file.contents;

  // Add type aliases (normally added by emitter via writeFileSync after writeOutput)
  content = addTypeAliases(content, dataModels);

  return content;
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
