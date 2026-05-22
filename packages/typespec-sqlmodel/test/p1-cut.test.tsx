import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { emit } from "../src/emitter.js";
import { createTestRunner, emitPyFile } from "./utils.jsx";

describe("P1 cut — form metadata round-trip on @table", () => {
  it("emits @title on a @table property as json_schema_extra", async () => {
    const output = await emitPyFile(
      `
      @table
      model User {
        @key id: uuid;
        @title("User Email") email: string;
      }
    `,
      "user.py",
    );

    expect(output).toContain('"title": "User Email"');
    expect(output).toContain("json_schema_extra=");
  });

  it("emits @placeholder on a @table property as json_schema_extra", async () => {
    const output = await emitPyFile(
      `
      @table
      model User {
        @key id: uuid;
        @placeholder("you@example.com") email: string;
      }
    `,
      "user.py",
    );

    expect(output).toContain('"placeholder": "you@example.com"');
  });
});

describe("P1 cut — catalog metadata as Column.info", () => {
  it("renders @audit role into Column info", async () => {
    const output = await emitPyFile(
      `
      @table
      model Post {
        @key id: uuid;
        @audit("createdBy") createdBy: uuid;
      }
    `,
      "post.py",
    );

    expect(output).toContain('"audit": "createdBy"');
    expect(output).toContain("info=");
  });

  it("renders @classification into Column info", async () => {
    const output = await emitPyFile(
      `
      @table
      model Post {
        @key id: uuid;
        @classification("pii") email: string;
      }
    `,
      "post.py",
    );

    expect(output).toContain('"classification": "pii"');
  });

  it("renders @scope as a list in Column info", async () => {
    const output = await emitPyFile(
      `
      @table
      model Post {
        @key id: uuid;
        @scope("frontend") title: string;
      }
    `,
      "post.py",
    );

    expect(output).toContain('"scope": ["frontend"]');
  });

  it("inherits @owner from the parent model into Column info", async () => {
    const output = await emitPyFile(
      `
      @owner("data-platform")
      @table
      model Post {
        @key id: uuid;
        @scope("frontend") title: string;
      }
    `,
      "post.py",
    );

    expect(output).toContain('"owner": "data-platform"');
  });
});

describe("P1 cut — Atlas opt-in", () => {
  it("does not write atlas.hcl by default in standalone mode", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      namespace Demo.Acme {
        @table
        model User { @key id: uuid; email: string; }
      }
    `);
    const outDir = await mkdtemp(join(tmpdir(), "sqlmodel-p1-atlas-off-"));
    await emit({
      program: runner.program,
      options: { standalone: true, "library-name": "demo" },
      emitterOutputDir: outDir,
    } as never);

    await expect(readFile(join(outDir, "atlas.hcl"), "utf8")).rejects.toThrow();
  });

  it("writes atlas.hcl when emit-atlas is true", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      namespace Demo.Acme {
        @table
        model User { @key id: uuid; email: string; }
      }
    `);
    const outDir = await mkdtemp(join(tmpdir(), "sqlmodel-p1-atlas-on-"));
    await emit({
      program: runner.program,
      options: { standalone: true, "library-name": "demo", "emit-atlas": true },
      emitterOutputDir: outDir,
    } as never);

    const atlas = await readFile(join(outDir, "atlas.hcl"), "utf8");
    expect(atlas).toContain('data "external_schema" "sqlmodel"');
  });
});

describe("P1 cut — JSONB typing strict-by-default", () => {
  it("uses union JSON type instead of Any", async () => {
    const output = await emitPyFile(
      `
      @table
      model Doc {
        @key id: uuid;
        payload: jsonb;
      }
    `,
      "doc.py",
    );

    expect(output).toContain("dict[str, Any] | list[Any] | str | int | float | bool | None");
  });
});

describe("P1 cut — SAEnum stable name", () => {
  it("emits SAEnum(..., name=<snake>) for a Postgres enum-type identity", async () => {
    const output = await emitPyFile(
      `
      enum AccessLevel {
        admin: "admin",
        member: "member",
      }

      @table
      model Member {
        @key id: uuid;
        level: AccessLevel;
      }
    `,
      "member.py",
    );

    expect(output).toContain('SAEnum(AccessLevel, name="access_level")');
  });
});

describe("P1 cut — pyproject.toml polish", () => {
  it("includes license, classifiers, and pinned core deps", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      namespace Demo.Acme {
        @table
        model User { @key id: uuid; email: string; }
      }
    `);
    const outDir = await mkdtemp(join(tmpdir(), "sqlmodel-p1-pyproject-"));
    await emit({
      program: runner.program,
      options: { standalone: true, "library-name": "demo" },
      emitterOutputDir: outDir,
    } as never);

    const pyproject = await readFile(join(outDir, "pyproject.toml"), "utf8");
    expect(pyproject).toContain('license = { text = "Proprietary" }');
    expect(pyproject).toContain('"Programming Language :: Python :: 3"');
    expect(pyproject).toContain('"sqlmodel>=0.0.16,<1.0"');
    expect(pyproject).toContain('"sqlalchemy>=2.0,<3.0"');
    expect(pyproject).toContain('"pydantic[email]>=2.0,<3.0"');
  });
});

describe("P1 cut — multi-namespace target_metadata exposure", () => {
  it("exposes target_metadata at every package level, including multi-segment", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      namespace Foo.Bar.Baz {
        @table
        model Thing { @key id: uuid; name: string; }
      }
    `);
    const outDir = await mkdtemp(join(tmpdir(), "sqlmodel-p1-metadata-"));
    await emit({
      program: runner.program,
      options: { standalone: true, "library-name": "demo" },
      emitterOutputDir: outDir,
    } as never);

    const fooInit = await readFile(join(outDir, "test/foo/__init__.py"), "utf8");
    const barInit = await readFile(join(outDir, "test/foo/bar/__init__.py"), "utf8");
    const bazInit = await readFile(join(outDir, "test/foo/bar/baz/__init__.py"), "utf8");

    expect(fooInit).toContain("target_metadata = SQLModel.metadata");
    expect(barInit).toContain("target_metadata = SQLModel.metadata");
    expect(bazInit).toContain("target_metadata = SQLModel.metadata");
  });
});

describe("P2 polish — standalone README and LICENSE", () => {
  it("emits README.md and a default LICENSE alongside pyproject.toml", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      namespace Demo.Acme {
        @table
        model User { @key id: uuid; email: string; }
      }
    `);
    const outDir = await mkdtemp(join(tmpdir(), "sqlmodel-p2-readme-"));
    await emit({
      program: runner.program,
      options: { standalone: true, "library-name": "demo" },
      emitterOutputDir: outDir,
    } as never);

    const readme = await readFile(join(outDir, "README.md"), "utf8");
    const license = await readFile(join(outDir, "LICENSE"), "utf8");
    expect(readme).toContain("# demo");
    expect(readme).toContain("pip install demo");
    expect(license).toContain("Proprietary");
  });

  it("uses the configured license text when provided", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      namespace Demo.Acme {
        @table
        model User { @key id: uuid; email: string; }
      }
    `);
    const outDir = await mkdtemp(join(tmpdir(), "sqlmodel-p2-license-"));
    await emit({
      program: runner.program,
      options: {
        standalone: true,
        "library-name": "demo",
        license: "MIT License — see LICENSES/MIT.txt for details.",
      },
      emitterOutputDir: outDir,
    } as never);

    const license = await readFile(join(outDir, "LICENSE"), "utf8");
    expect(license).toContain("MIT License");
  });
});

describe("P2 polish — #scope filtering across @table and data models", () => {
  it("emits only scoped subset when include uses a #scope selector", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      namespace Demo.Acme {
        @scope("frontend")
        @table
        model Public { @key id: uuid; name: string; }

        @table
        model Internal { @key id: uuid; secret: string; }

        @scope("frontend")
        @data("Public Form")
        model PublicForm { name: string; }

        @data("Internal Form")
        model InternalForm { secret: string; }
      }
    `);
    const outDir = await mkdtemp(join(tmpdir(), "sqlmodel-scope-filter-"));
    await emit({
      program: runner.program,
      options: {
        standalone: true,
        "library-name": "demo",
        include: ["#frontend"],
      },
      emitterOutputDir: outDir,
    } as never);

    const initFile = await readFile(join(outDir, "test/demo/acme/__init__.py"), "utf8");
    const publicFile = await readFile(join(outDir, "test/demo/acme/public.py"), "utf8");
    const publicForm = await readFile(join(outDir, "test/demo/acme/public_form.py"), "utf8");
    expect(publicFile).toContain("class Public");
    expect(publicForm).toContain("class PublicForm");
    expect(initFile).toContain("Public");
    expect(initFile).not.toContain("Internal");
    await expect(readFile(join(outDir, "test/demo/acme/internal.py"), "utf8")).rejects.toThrow();
    await expect(
      readFile(join(outDir, "test/demo/acme/internal_form.py"), "utf8"),
    ).rejects.toThrow();
  });
});
