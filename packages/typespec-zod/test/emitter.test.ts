import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { $onEmit } from "../src/emitter.js";
import { createTestRunner } from "./utils.jsx";

describe("Zod emitter entrypoint", () => {
  it("reports standalone mode without a library name", async () => {
    const runner = await createTestRunner();
    await runner.compile(`model Placeholder {}`);
    const outDir = await mkdtemp(join(tmpdir(), "zod-emitter-standalone-"));

    await $onEmit({
      program: runner.program,
      options: { standalone: true },
      emitterOutputDir: outDir,
    } as never);

    expect(
      runner.program.diagnostics.some(
        (diag) => diag.code === "@qninhdt/typespec-zod/standalone-requires-library-name",
      ),
    ).toBe(true);
  });

  it("emits no files when there are no data models", async () => {
    const runner = await createTestRunner();
    await runner.compile(`model Placeholder {}`);
    const outDir = await mkdtemp(join(tmpdir(), "zod-emitter-empty-"));

    await $onEmit({
      program: runner.program,
      options: {},
      emitterOutputDir: outDir,
    } as never);

    const errorDiagnostics = runner.program.diagnostics.filter((diag) => diag.severity === "error");
    expect(errorDiagnostics).toEqual([]);
    await expect(readdir(outDir)).resolves.toEqual([]);
  });

  it("emits standalone package files for data models", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      namespace Demo.Forms {
        @data("Register Form")
        model RegisterForm {
          email: string;
        }
      }
    `);

    const outDir = await mkdtemp(join(tmpdir(), "zod-emitter-full-"));
    await $onEmit({
      program: runner.program,
      options: {
        standalone: true,
        "library-name": "demo-zod",
      },
      emitterOutputDir: outDir,
    } as never);

    const packageJson = await readFile(join(outDir, "package.json"), "utf8");
    const indexFile = await readFile(join(outDir, "src/index.ts"), "utf8");
    const modelFile = await readFile(join(outDir, "src/test/demo/forms/RegisterForm.ts"), "utf8");

    expect(packageJson).toContain('"name": "demo-zod"');
    expect(indexFile).toContain('export * from "./test/demo/forms/RegisterForm.js";');
    expect(modelFile).toContain("RegisterFormSchema");
    expect(modelFile).toContain("email: z.string()");
    expect(modelFile).toContain("export type RegisterForm = z.infer<typeof RegisterFormSchema>;");
  });
});
