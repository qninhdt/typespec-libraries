import {
  createTestHost as coreCreateTestHost,
  createTestWrapper,
} from "@typespec/compiler/testing";
import { TypeSpecProtobufTestLibrary } from "../src/testing/index.js";
import { TypeSpecOrmTestLibrary } from "@qninhdt/typespec-orm/testing";
import { $onEmit } from "../src/proto-emitter.js";
import type { Program } from "@typespec/compiler";
import { tmpdir } from "os";
import { mkdtemp, readdir, readFile } from "fs/promises";
import { join } from "path";

async function createTestHost() {
  return coreCreateTestHost({
    libraries: [TypeSpecOrmTestLibrary, TypeSpecProtobufTestLibrary],
  });
}

export async function createTestRunner() {
  const host = await createTestHost();
  return createTestWrapper(host, {});
}

export async function emitProto(code: string): Promise<string[]> {
  const runner = await createTestRunner();
  await runner.compile(code);
  return buildProtoOutput(runner.program);
}

export async function emitSingleProto(code: string): Promise<string> {
  const files = await emitProto(code);
  if (files.length === 0) throw new Error("No proto files generated");
  return files[0];
}

async function buildProtoOutput(program: Program): Promise<string[]> {
  const dir = await mkdtemp(join(tmpdir(), "proto-test-"));
  const context = {
    program,
    options: { "output-dir": dir },
    emitterOutputDir: dir,
    getAssetEmitter: () => null,
  } as any;

  await $onEmit(context);
  return collectFiles(dir);
}

async function collectFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await collectFiles(fullPath)));
    } else if (entry.name.endsWith(".proto")) {
      const content = await readFile(fullPath, "utf-8");
      results.push(content);
    }
  }
  return results;
}
