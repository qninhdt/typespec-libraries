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

  it("emits association modules and runtime imports for many-to-many tables", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      namespace Demo.Collab {
        enum AccessLevel {
          admin: "admin",
          member: "member",
        }

        @table
        model User {
          @key id: uuid;
          @manyToMany("user_roles")
          roles: Role[];
        }

        @table
        model Role {
          @key code: AccessLevel;
          @manyToMany("user_roles")
          users: User[];
        }

        @table
        model Project {
          @key id: int32;
          @manyToMany("project_tags")
          tags: Tag[];
        }

        @table
        model Tag {
          @key id: int64;
          @manyToMany("project_tags")
          projects: Project[];
        }

        @table
        model Pricebook {
          @key @precision(10, 2) code: decimal;
          @manyToMany("pricebook_regions")
          regions: Region[];
        }

        @table
        model Region {
          @key code: string;
          @manyToMany("pricebook_regions")
          pricebooks: Pricebook[];
        }
      }
    `);

    const outDir = await mkdtemp(join(tmpdir(), "sqlmodel-emitter-associations-"));
    await emit({
      program: runner.program,
      options: {
        standalone: true,
        "library-name": "demo-sqlmodel",
      },
      emitterOutputDir: outDir,
    } as never);

    const associations = await readFile(join(outDir, "test/__associations__.py"), "utf8");
    const user = await readFile(join(outDir, "test/demo/collab/user.py"), "utf8");

    expect(associations).toContain("user_roles = Table(");
    expect(associations).toContain("project_tags = Table(");
    expect(associations).toContain("pricebook_regions = Table(");
    expect(associations).toContain("PGUUID(as_uuid=True)");
    expect(associations).toContain("String(20)");
    expect(associations).toContain("Integer");
    expect(associations).toContain("BigInteger");
    expect(associations).toContain("Numeric(10, 2)");
    expect(user).toContain("from test.__associations__ import user_roles");
  });
});
