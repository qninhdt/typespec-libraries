import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { $onEmit } from "../src/emitter.js";
import { createTestRunner } from "./utils.jsx";

describe("P1 Group B — root barrel correctness", () => {
  it("re-exports _scalars when at least one custom scalar is emitted", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      @minLength(8)
      scalar StrongPassword extends string;

      @data("Form")
      model LoginForm {
        password: StrongPassword;
      }
    `);
    const outDir = await mkdtemp(join(tmpdir(), "zod-p1-barrel-"));
    await $onEmit({
      program: runner.program,
      options: {},
      emitterOutputDir: outDir,
    } as never);

    const indexFile = await readFile(join(outDir, "index.ts"), "utf8");
    expect(indexFile).toContain('export * from "./_scalars.js";');
  });

  it("does not re-export _scalars when no custom scalars exist", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      @data("Form")
      model Plain {
        name: string;
      }
    `);
    const outDir = await mkdtemp(join(tmpdir(), "zod-p1-barrel-noscalars-"));
    await $onEmit({
      program: runner.program,
      options: {},
      emitterOutputDir: outDir,
    } as never);

    const indexFile = await readFile(join(outDir, "index.ts"), "utf8");
    expect(indexFile).not.toContain("./_scalars.js");
  });

  it("namespaces collision pairs as `export * as Qualified` and keeps unique names plain", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      namespace A {
        @data("Form")
        model Item { value: string; }
      }
      namespace B {
        @data("Form")
        model Item { value: int32; }
      }
      namespace C {
        @data("Form")
        model Unique { name: string; }
      }
    `);
    const outDir = await mkdtemp(join(tmpdir(), "zod-p1-barrel-collision-"));
    await $onEmit({
      program: runner.program,
      options: {},
      emitterOutputDir: outDir,
    } as never);

    const indexFile = await readFile(join(outDir, "index.ts"), "utf8");
    // The two `Item`s come from sibling namespaces and must be qualified.
    const itemReexports = indexFile.match(/export \* as \w+ from "[^"]*Item\.js"/g) ?? [];
    expect(itemReexports.length).toBe(2);
    // The unique model still uses unqualified `export *`.
    expect(indexFile).toMatch(/export \* from "[^"]*Unique\.js";/);
    // Sanity: the alias names should differ (otherwise the qualifier is broken).
    const aliases = itemReexports.map((line) => line.match(/export \* as (\w+)/)![1]);
    expect(new Set(aliases).size).toBe(2);
  });
});
