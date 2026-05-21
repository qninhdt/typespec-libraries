import type { OutputDirectory, ContentOutputFile } from "@alloy-js/core";
import {
  createTestHost as coreCreateTestHost,
  createTestWrapper,
  type TypeSpecTestLibrary,
} from "@typespec/compiler/testing";
import { TypeSpecOrmTestLibrary } from "./index.js";
import { expect } from "vitest";

export function findOutputFile(
  dir: OutputDirectory,
  fileName: string,
): ContentOutputFile | undefined {
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

export function listAllFiles(dir: OutputDirectory): string[] {
  const files: string[] = [];
  for (const item of dir.contents) {
    if (item.kind === "file") files.push(item.path);
    if (item.kind === "directory") files.push(...listAllFiles(item));
  }
  return files;
}

export function getOutputFileContent(output: OutputDirectory, fileName: string): string {
  const file = findOutputFile(output, fileName);
  if (!file) {
    const available = listAllFiles(output);
    throw new Error(
      `File "${fileName}" not found in output. Available files: ${available.join(", ")}`,
    );
  }
  return file.contents;
}

export function expectFileContains(
  output: OutputDirectory,
  fileName: string,
  ...substrings: string[]
): void {
  const actual = getOutputFileContent(output, fileName);
  for (const sub of substrings) {
    expect(actual, `Expected "${fileName}" to contain:\n${sub}\n\nActual:\n${actual}`).toContain(
      sub,
    );
  }
}

export async function createTestHost(libraries: TypeSpecTestLibrary[]) {
  return coreCreateTestHost({
    libraries: [TypeSpecOrmTestLibrary, ...libraries],
  });
}

export async function createTestRunner(libraries: TypeSpecTestLibrary[]) {
  const host = await createTestHost(libraries);
  return createTestWrapper(host, {
    wrapper: (code) => `using Qninhdt.Orm;\nnamespace Test {\n${code}\n}`,
  });
}

export async function createEmitterTestRunner(config: {
  libraries: TypeSpecTestLibrary[];
  emitterName: string;
  emitterOptions?: Record<string, unknown>;
}) {
  const host = await createTestHost(config.libraries);
  return createTestWrapper(host, {
    wrapper: (code) => `using Qninhdt.Orm;\nnamespace Test {\n${code}\n}`,
    compilerOptions: {
      emit: [config.emitterName],
      options: {
        [config.emitterName]: { ...config.emitterOptions },
      },
    },
  });
}
