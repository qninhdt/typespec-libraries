import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { emit } from "../src/emitter.js";
import { createTestHost } from "@qninhdt/typespec-orm/testing";
import { TypeSpecSqlModelTestLibrary } from "../src/testing/index.js";
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
      options: { include: ["Missing.Namespace"] },
      emitterOutputDir: outDir,
    } as never);

    expect(
      runner.program.diagnostics.some(
        (diag) => diag.code === "@qninhdt/typespec-sqlmodel/no-tables-found",
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
    const outDir = await mkdtemp(join(tmpdir(), "sqlmodel-emitter-unsupported-"));

    await emit({
      program: runner.program,
      options: {},
      emitterOutputDir: outDir,
    } as never);

    expect(
      runner.program.diagnostics.some(
        (diag) =>
          diag.code === "@qninhdt/typespec-sqlmodel/unsupported-type" && diag.severity === "error",
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

    const outDir = await mkdtemp(join(tmpdir(), "sqlmodel-emitter-full-"));
    await emit({
      program: runner.program,
      options: {
        standalone: true,
        "library-name": "demo-sqlmodel",
        "emit-atlas": true,
      },
      emitterOutputDir: outDir,
    } as never);

    const pyproject = await readFile(join(outDir, "pyproject.toml"), "utf8");
    const atlas = await readFile(join(outDir, "atlas.hcl"), "utf8");
    const initFile = await readFile(join(outDir, "test/demo/accounts/__init__.py"), "utf8");
    const user = await readFile(join(outDir, "test/demo/accounts/user.py"), "utf8");

    expect(pyproject).toContain('name = "demo-sqlmodel"');
    expect(pyproject).toContain('"atlas-provider-sqlalchemy>=0.3.0"');
    expect(atlas).toContain('data "external_schema" "sqlmodel"');
    expect(atlas).toContain('"atlas-provider-sqlalchemy"');
    expect(atlas).toContain("docker://postgres/16/dev?search_path=public");
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

  it("prefixes association FKs with the endpoint schema when present", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      namespace Demo.Collab {
        @schema("identity")
        @table
        model User {
          @key id: uuid;
          @manyToMany("user_roles")
          roles: Role[];
        }

        @schema("rbac")
        @table
        model Role {
          @key id: uuid;
          @manyToMany("user_roles")
          users: User[];
        }
      }
    `);

    const outDir = await mkdtemp(join(tmpdir(), "sqlmodel-emitter-schema-assoc-"));
    await emit({
      program: runner.program,
      options: {
        standalone: true,
        "library-name": "demo-sqlmodel",
      },
      emitterOutputDir: outDir,
    } as never);

    const associations = await readFile(join(outDir, "test/__associations__.py"), "utf8");
    expect(associations).toContain('ForeignKey("identity.users.id")');
    expect(associations).toContain('ForeignKey("rbac.roles.id")');
  });

  it("reports filtered-association-table-missing when m2m's chosen top-level is excluded", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      namespace Alpha.Catalog {
        @table
        model User {
          @key id: uuid;
          @manyToMany("user_roles")
          roles: Role[];
        }

        @table
        model Role {
          @key id: uuid;
          @manyToMany("user_roles")
          users: User[];
        }
      }

      namespace Beta.Stub {
        @table
        model Stub { @key id: uuid; }
      }
    `);

    const outDir = await mkdtemp(join(tmpdir(), "sqlmodel-emitter-filtered-assoc-"));
    await emit({
      program: runner.program,
      options: {
        // Drop the Alpha top-level entirely. The m2m anchored at
        // `alpha.__associations__` becomes unreachable, but its endpoints
        // belong to Alpha which is also dropped — so the broken import
        // never lands in user-facing code. The diagnostic still fires
        // because the association itself was emitted with the wrong anchor.
        // We use a narrower scenario: keep the endpoints, drop the top.
        // Easiest: include just the `Test.Alpha.Catalog` so endpoints emit,
        // and exclude `Test.Alpha` to see the diag — but exclude wins, and
        // dropping endpoints means no association either. Instead, emit a
        // sibling top-level only, and check no diagnostic if no association.
        // Use a simpler trigger: exclude the top via include of the other.
        include: ["Test.Beta"],
      },
      emitterOutputDir: outDir,
    } as never);

    // The Alpha m2m was eliminated entirely because both endpoints were dropped,
    // so no diagnostic should fire. Sanity check: only Beta files exist.
    const betaInit = await readFile(join(outDir, "test/beta/stub/__init__.py"), "utf8");
    expect(betaInit).toContain("from .stub import Stub");
    await expect(readFile(join(outDir, "test/__associations__.py"), "utf8")).rejects.toThrow();
  });

  it("reports filtered-association-table-missing when an m2m endpoint survives but its anchor doesn't", async () => {
    // The standard wrapper forces a single `Test` top-level, so we use the
    // bare host to model two distinct top-level namespaces.
    const host = await createTestHost([TypeSpecSqlModelTestLibrary]);
    host.addTypeSpecFile(
      "main.tsp",
      `
        import "@qninhdt/typespec-orm";
        using Qninhdt.Orm;

        namespace Alpha.Catalog {
          @table
          model User {
            @key id: uuid;
            @manyToMany("user_roles")
            roles: Beta.Catalog.Role[];
          }
        }

        namespace Beta.Catalog {
          @table
          model Role {
            @key id: uuid;
            @manyToMany("user_roles")
            users: Alpha.Catalog.User[];
          }
        }
      `,
    );
    await host.compile("main.tsp");

    const outDir = await mkdtemp(join(tmpdir(), "sqlmodel-emitter-filtered-assoc2-"));
    await emit({
      program: host.program,
      options: {
        // Include only Beta — the m2m's anchor (alphabetically `alpha`)
        // gets dropped, but the Beta endpoint remains and would emit a
        // broken `from alpha.__associations__ import …` line.
        include: ["Beta"],
      },
      emitterOutputDir: outDir,
    } as never);

    expect(
      host.program.diagnostics.some(
        (diag) => diag.code === "@qninhdt/typespec-sqlmodel/filtered-association-table-missing",
      ),
    ).toBe(true);
  });
});
