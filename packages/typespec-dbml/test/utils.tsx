import { render, SourceDirectory, SourceFile, type OutputDirectory } from "@alloy-js/core";
import { TypeSpecDbmlTestLibrary } from "../src/testing/index.js";
import {
  createTestRunner as sharedCreateTestRunner,
  createEmitterTestRunner as sharedCreateEmitterTestRunner,
  getOutputFileContent,
  expectFileContains,
} from "@qninhdt/typespec-orm/testing";
import { classifyProperties, collectTableModels } from "@qninhdt/typespec-orm";
import { DbmlTable } from "../src/components/DbmlTable.jsx";
import { generateEnumDefinition } from "../src/components/DbmlEnum.jsx";
import { generateRelationFields } from "../src/components/DbmlRelationField.jsx";
import { expect } from "vitest";

const LIBRARIES = [TypeSpecDbmlTestLibrary];

export async function createTestRunner() {
  return sharedCreateTestRunner(LIBRARIES);
}

export async function createEmitterTestRunner(emitterOptions?: Record<string, unknown>) {
  return sharedCreateEmitterTestRunner({
    libraries: LIBRARIES,
    emitterName: "@qninhdt/typespec-dbml",
    emitterOptions,
  });
}

export async function emitDbmlFile(code: string, fileName: string): Promise<string> {
  const output = await renderDbmlOutput(code);
  return getOutputFileContent(output, fileName);
}

export async function renderDbmlOutput(code: string): Promise<OutputDirectory> {
  const runner = await createTestRunner();
  await runner.compile(code);

  const diags = runner.program.diagnostics.filter((d) => d.severity === "error");
  expect(
    diags,
    `TypeSpec compilation errors: ${diags.map((d) => d.message).join("; ")}`,
  ).toHaveLength(0);

  const program = runner.program;
  const tables = collectTableModels(program);

  const tree = (
    <SourceDirectory path=".">
      {tables.map(({ model, tableName }) => {
        const { enumTypes, relations } = classifyProperties(program, model);
        const tableDef = DbmlTable({ program, model, tableName });
        const refs = generateRelationFields(program, relations, tableName);

        const codeParts: string[] = ["// Database Schema", ""];
        for (const [enumName, members] of enumTypes) {
          codeParts.push(generateEnumDefinition(enumName, members), "");
        }
        codeParts.push(tableDef, "");
        for (const ref of refs) {
          codeParts.push(ref);
        }

        return (
          <SourceFile path={`${tableName}.dbml`} filetype="dbml" printWidth={9999}>
            {codeParts.join("\n")}
          </SourceFile>
        );
      })}
    </SourceDirectory>
  );

  return render(tree);
}

export async function expectDbmlFileContains(
  code: string,
  fileName: string,
  ...substrings: string[]
): Promise<void> {
  const output = await renderDbmlOutput(code);
  expectFileContains(output, fileName, ...substrings);
}
