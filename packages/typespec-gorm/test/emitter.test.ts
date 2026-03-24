import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { emit } from "../src/emitter.js";
import { createTestRunner } from "./utils.js";

describe("GORM emitter entrypoint", () => {
  it("reports standalone mode without a library name", async () => {
    const runner = await createTestRunner();
    await runner.compile(`model Placeholder {}`);
    const outDir = await mkdtemp(join(tmpdir(), "gorm-emitter-standalone-"));

    await emit({
      program: runner.program,
      options: { standalone: true },
      emitterOutputDir: outDir,
    } as never);

    expect(
      runner.program.diagnostics.some(
        (diag) => diag.code === "@qninhdt/typespec-gorm/standalone-requires-library-name",
      ),
    ).toBe(true);
  });

  it("reports when no ORM tables or data models are selected", async () => {
    const runner = await createTestRunner();
    await runner.compile(`model Placeholder {}`);
    const outDir = await mkdtemp(join(tmpdir(), "gorm-emitter-empty-"));

    await emit({
      program: runner.program,
      options: {},
      emitterOutputDir: outDir,
    } as never);

    expect(
      runner.program.diagnostics.some(
        (diag) => diag.code === "@qninhdt/typespec-gorm/no-tables-found",
      ),
    ).toBe(true);
  });

  it("emits standalone files for tables and data models", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      namespace Demo.Accounts {
        @table
        model User {
          @key id: uuid;
          email: string;
        }

        @data("Register Form")
        model RegisterForm {
          email: string;
        }
      }
    `);

    const outDir = await mkdtemp(join(tmpdir(), "gorm-emitter-full-"));
    await emit({
      program: runner.program,
      options: {
        standalone: true,
        "library-name": "github.com/example/demo",
      },
      emitterOutputDir: outDir,
    } as never);

    const mod = await readFile(join(outDir, "go.mod"), "utf8");
    const models = await readFile(join(outDir, "models.go"), "utf8");
    const user = await readFile(join(outDir, "test/demo/accounts/user.go"), "utf8");

    expect(mod).toContain("module github.com/example/demo");
    expect(models).toContain("package demo");
    expect(user).toContain("type User struct");
  });
});
