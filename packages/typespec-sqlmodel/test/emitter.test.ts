import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { emit } from "../src/emitter.js";
import { createTestRunner } from "./utils.js";

describe("SQLModel emitter entrypoint", () => {
  it("reports standalone mode without a library name", async () => {
    const runner = await createTestRunner();
    await runner.compile(`model Placeholder {}`);
    const outDir = await mkdtemp(join(tmpdir(), "sqlmodel-emitter-standalone-"));

    await emit({
      program: runner.program,
      options: { standalone: true },
      emitterOutputDir: outDir,
    } as never);

    expect(
      runner.program.diagnostics.some(
        (diag) => diag.code === "@qninhdt/typespec-sqlmodel/standalone-requires-library-name",
      ),
    ).toBe(true);
  });

  it("reports when no ORM tables or data models are selected", async () => {
    const runner = await createTestRunner();
    await runner.compile(`model Placeholder {}`);
    const outDir = await mkdtemp(join(tmpdir(), "sqlmodel-emitter-empty-"));

    await emit({
      program: runner.program,
      options: {},
      emitterOutputDir: outDir,
    } as never);

    expect(
      runner.program.diagnostics.some(
        (diag) => diag.code === "@qninhdt/typespec-sqlmodel/no-tables-found",
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

    const outDir = await mkdtemp(join(tmpdir(), "sqlmodel-emitter-full-"));
    await emit({
      program: runner.program,
      options: {
        standalone: true,
        "library-name": "demo-sqlmodel",
      },
      emitterOutputDir: outDir,
    } as never);

    const pyproject = await readFile(join(outDir, "pyproject.toml"), "utf8");
    const initFile = await readFile(join(outDir, "test/demo/accounts/__init__.py"), "utf8");
    const user = await readFile(join(outDir, "test/demo/accounts/user.py"), "utf8");

    expect(pyproject).toContain('name = "demo-sqlmodel"');
    expect(initFile).toContain("from .user import User");
    expect(user).toContain("class User");
  });
});
