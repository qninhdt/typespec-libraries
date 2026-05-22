import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { emit } from "../src/emitter.js";
import { createTestRunner } from "./utils.js";

describe("Ent emitter entrypoint", () => {
  it("reports standalone mode without a library name", async () => {
    const runner = await createTestRunner();
    await runner.compile(`model Placeholder {}`);
    const outDir = await mkdtemp(join(tmpdir(), "ent-emitter-standalone-"));

    await emit({
      program: runner.program,
      options: { standalone: true },
      emitterOutputDir: outDir,
    } as never);

    expect(
      runner.program.diagnostics.some(
        (diag) => diag.code === "@qninhdt/typespec-ent/standalone-requires-library-name",
      ),
    ).toBe(true);
  });

  it("reports when no ORM tables or data models are selected", async () => {
    const runner = await createTestRunner();
    await runner.compile(`model Placeholder {}`);
    const outDir = await mkdtemp(join(tmpdir(), "ent-emitter-empty-"));

    await emit({
      program: runner.program,
      options: { include: ["Missing.Namespace"] },
      emitterOutputDir: outDir,
    } as never);

    expect(
      runner.program.diagnostics.some(
        (diag) => diag.code === "@qninhdt/typespec-ent/no-tables-found",
      ),
    ).toBe(true);
  });

  it("reports unsupported field types as errors", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      @table
      model Broken {
        @key id: uuid;
        payload: unknown;
      }
    `);
    const outDir = await mkdtemp(join(tmpdir(), "ent-emitter-unsupported-"));

    await emit({
      program: runner.program,
      options: {},
      emitterOutputDir: outDir,
    } as never);

    expect(
      runner.program.diagnostics.some(
        (diag) =>
          diag.code === "@qninhdt/typespec-ent/unsupported-type" && diag.severity === "error",
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

        model RegisterForm {
          email: string;
        }
      }
    `);

    const outDir = await mkdtemp(join(tmpdir(), "ent-emitter-full-"));
    await emit({
      program: runner.program,
      options: {
        standalone: true,
        "library-name": "github.com/example/demo",
      },
      emitterOutputDir: outDir,
    } as never);

    const mod = await readFile(join(outDir, "go.mod"), "utf8");
    const atlas = await readFile(join(outDir, "atlas.hcl"), "utf8");
    const generate = await readFile(join(outDir, "ent/generate.go"), "utf8");
    const user = await readFile(join(outDir, "ent/schema/user.go"), "utf8");
    const form = await readFile(join(outDir, "test/demo/accounts/register_form.go"), "utf8");

    expect(mod).toContain("module github.com/example/demo");
    expect(atlas).toContain('src = "ent://ent/schema"');
    expect(generate).toContain("entgo.io/ent/cmd/ent generate ./schema");
    expect(user).toContain("type User struct");
    expect(user).toContain("func (User) Fields() []ent.Field");
    expect(form).toContain("type RegisterForm struct");
  });

  it("documents the typical Atlas migration commands in ent/generate.go", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      @table
      model User {
        @key id: uuid;
      }
    `);

    const outDir = await mkdtemp(join(tmpdir(), "ent-emitter-atlas-doc-"));
    await emit({
      program: runner.program,
      options: {
        standalone: true,
        "library-name": "github.com/example/demo",
      },
      emitterOutputDir: outDir,
    } as never);

    const generate = await readFile(join(outDir, "ent/generate.go"), "utf8");
    expect(generate).toContain("atlas migrate diff --env ent");
    expect(generate).toContain("atlas migrate apply --env ent");
    expect(generate).toContain("go generate ./ent");
  });

  it("emits a README and .gitignore in standalone output", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      @table
      model User {
        @key id: uuid;
      }
    `);

    const outDir = await mkdtemp(join(tmpdir(), "ent-emitter-standalone-extras-"));
    await emit({
      program: runner.program,
      options: {
        standalone: true,
        "library-name": "github.com/example/demo",
        version: "1.2.3",
      },
      emitterOutputDir: outDir,
    } as never);

    const readme = await readFile(join(outDir, "README.md"), "utf8");
    const gitignore = await readFile(join(outDir, ".gitignore"), "utf8");

    expect(readme).toContain("github.com/example/demo");
    expect(readme).toContain("1.2.3");
    expect(readme).toContain("go mod tidy");
    expect(readme).toContain("atlas migrate diff");
    expect(gitignore).toContain(".env");
    expect(gitignore).toContain("dev.db");
    expect(gitignore).not.toContain("atlas.sum");
  });
});
