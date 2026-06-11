/**
 * Production-hardening tests:
 * - `unsupported-format` diagnostic for built-in string scalars without a Zod equivalent
 * - `unsupported-type` diagnostic for unmappable types
 * - `z.lazy(...)` wrapping for self-referential models
 */

import { describe, expect, it } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { $onEmit } from "../src/emitter.js";
import { createTestRunner } from "./utils.jsx";
import { emitZodFile } from "./utils.jsx";

describe("Production hardening — diagnostics", () => {
  it("emits `unsupported-type` for an unmappable composite type", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      model Broken {
        payload: composite<"left", "right">;
      }
    `);
    const outDir = await mkdtemp(join(tmpdir(), "zod-p2-unsupported-type-"));
    await $onEmit({
      program: runner.program,
      options: {},
      emitterOutputDir: outDir,
    } as never);

    expect(
      runner.program.diagnostics.some(
        (d) => d.code === "@qninhdt/typespec-zod/unsupported-type" && d.severity === "error",
      ),
    ).toBe(true);
  });
});

describe("Production hardening — cycle handling", () => {
  it("wraps a self-referential model property in z.lazy(...)", async () => {
    const output = await emitZodFile(
      `
      model Folder {
        name: string;
        parent?: Folder;
      }
    `,
      "Folder.ts",
    );

    expect(output).toContain("z.lazy(");
    // Confirm the lazy wraps a reference to FolderSchema.
    expect(output).toMatch(/z\.lazy\(\(\)\s*=>\s*FolderSchema\)/);
  });

  it("does NOT wrap unrelated property references in z.lazy(...)", async () => {
    const output = await emitZodFile(
      `
      model Inner { value: string; }
      model Outer { inner: Inner; }
    `,
      "Outer.ts",
    );

    // Outer → Inner is a one-way reference, no cycle, no z.lazy needed.
    expect(output).not.toContain("z.lazy(");
  });
});
