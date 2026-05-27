import { describe, expect, it } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTestHost } from "@qninhdt/typespec-orm/testing";
import { TypeSpecSqlModelTestLibrary } from "../src/testing/index.js";
import { createTestRunner, emitPyFile, renderPyOutput } from "./utils.jsx";
import { emit } from "../src/emitter.js";
import { getOutputFileContent } from "@qninhdt/typespec-orm/testing";
import { generateField } from "../src/components/PyField.jsx";
import type { ModelProperty, Scalar } from "@typespec/compiler";

describe("Python scalar type mappings", () => {
  it("maps uuid to UUID with uuid4 import", async () => {
    const output = await emitPyFile(
      `
      @table
      model User {
        @key id: uuid;
      }
    `,
      "user.py",
    );

    expect(output).toContain("id: UUID");
    expect(output).toContain("from uuid import UUID, uuid4");
  });

  it("maps string to str and refuses to silently default max_length", async () => {
    const output = await emitPyFile(
      `
      @table
      model User {
        @key id: uuid;
        @maxLength(255) name: string;
      }
    `,
      "user.py",
    );

    expect(output).toContain("name: str");
    expect(output).toContain("max_length=255");
  });

  it("maps boolean to bool", async () => {
    const output = await emitPyFile(
      `
      @table
      model User {
        @key id: uuid;
        active: boolean;
      }
    `,
      "user.py",
    );

    expect(output).toContain("active: bool");
  });

  it("maps integer types to int", async () => {
    const output = await emitPyFile(
      `
      @table
      model IntTest {
        @key id: uuid;
        a: int8;
        b: int16;
        c: int32;
        d: int64;
      }
    `,
      "int_test.py",
    );

    expect(output).toContain("a: int");
    expect(output).toContain("b: int");
    expect(output).toContain("c: int");
    expect(output).toContain("d: int");
  });

  it("maps float types to float", async () => {
    const output = await emitPyFile(
      `
      @table
      model FloatTest {
        @key id: uuid;
        a: float32;
        b: float64;
      }
    `,
      "float_test.py",
    );

    expect(output).toContain("a: float");
    expect(output).toContain("b: float");
  });

  it("maps decimal to Decimal with import", async () => {
    const output = await emitPyFile(
      `
      @table
      model Product {
        @key id: uuid;
        price: decimal;
      }
    `,
      "product.py",
    );

    expect(output).toContain("price: Decimal");
    expect(output).toContain("from decimal import Decimal");
  });

  it("maps utcDateTime to datetime with import", async () => {
    const output = await emitPyFile(
      `
      @table
      model User {
        @key id: uuid;
        eventAt: utcDateTime;
      }
    `,
      "user.py",
    );

    expect(output).toContain("event_at: datetime");
    expect(output).toContain("from datetime import datetime");
  });

  it("maps bytes to bytes", async () => {
    const output = await emitPyFile(
      `
      @table
      model User {
        @key id: uuid;
        data: bytes;
      }
    `,
      "user.py",
    );

    expect(output).toContain("data: bytes");
  });

  it("uses | None for optional fields", async () => {
    const output = await emitPyFile(
      `
      @table
      model User {
        @key id: uuid;
        name: string;
        bio?: string;
        age?: int32;
      }
    `,
      "user.py",
    );

    // Required -no None
    expect(output).toMatch(/name: str = Field\(/);
    // Optional -| None with default=None
    expect(output).toContain("bio: str | None");
    expect(output).toContain("age: int | None");
    expect(output).toContain("default=None");
  });

  it("generates snake_case field names from camelCase", async () => {
    const output = await emitPyFile(
      `
      @table
      model User {
        @key id: uuid;
        displayName: string;
        avatarUrl?: string;
        isActive: boolean;
      }
    `,
      "user.py",
    );

    expect(output).toContain("display_name: str");
    expect(output).toContain("avatar_url: str | None");
    expect(output).toContain("is_active: bool");
  });

  it("generates correct import groups", async () => {
    const output = await emitPyFile(
      `
      @table
      model User {
        @key id: uuid;
        @autoCreateTime createdAt: utcDateTime;
        amount: decimal;
      }
    `,
      "user.py",
    );

    // Std lib imports
    expect(output).toContain("from uuid import UUID, uuid4");
    expect(output).toContain("from datetime import datetime");
    expect(output).toContain("from decimal import Decimal");
    // Framework imports
    expect(output).toContain("from sqlmodel import");
  });
});

describe("Python semantic scalar mappings", () => {
  it("maps email to EmailStr with pydantic import", async () => {
    const output = await emitPyFile(
      `
      @table
      model User {
        @key id: uuid;
        contact: email;
      }
    `,
      "user.py",
    );

    expect(output).toContain("contact: EmailStr");
    expect(output).toContain("EmailStr");
  });

  it("maps ipv4 to IPv4Address", async () => {
    const output = await emitPyFile(
      `
      @table
      model Server {
        @key id: uuid;
        addr: ipv4;
      }
    `,
      "server.py",
    );

    expect(output).toContain("addr: IPv4Address");
  });

  it("generates Annotated alias for cuid (no native pydantic type)", async () => {
    const output = await renderPyOutput(`
      @table
      model Resource {
        @key id: uuid;
        externalId: cuid;
      }
    `);
    const scalarsFile = getOutputFileContent(output, "_scalars.py");
    const modelFile = getOutputFileContent(output, "resource.py");

    expect(scalarsFile).toContain("cuid = Annotated[str, Field(");
    expect(scalarsFile).toContain("pattern=");
    expect(modelFile).toContain("from ._scalars import cuid");
    expect(modelFile).toContain("external_id: cuid");
  });

  it("generates Annotated alias for ulid (no native pydantic type)", async () => {
    const output = await renderPyOutput(`
      @table
      model Resource {
        @key id: uuid;
        externalId: ulid;
      }
    `);
    const scalarsFile = getOutputFileContent(output, "_scalars.py");
    const modelFile = getOutputFileContent(output, "resource.py");

    expect(scalarsFile).toContain("ulid = Annotated[str, Field(");
    expect(scalarsFile).toContain("pattern=");
    expect(modelFile).toContain("from ._scalars import ulid");
    expect(modelFile).toContain("external_id: ulid");
  });

  it("generates Annotated alias for nanoid (no native pydantic type)", async () => {
    const output = await renderPyOutput(`
      @table
      model Resource {
        @key id: uuid;
        shortId: nanoid;
      }
    `);
    const scalarsFile = getOutputFileContent(output, "_scalars.py");
    const modelFile = getOutputFileContent(output, "resource.py");

    expect(scalarsFile).toContain("nanoid = Annotated[str, Field(");
    expect(scalarsFile).toContain("pattern=");
    expect(modelFile).toContain("from ._scalars import nanoid");
    expect(modelFile).toContain("short_id: nanoid");
  });

  it("generates Annotated alias for jwt (no native pydantic type)", async () => {
    const output = await renderPyOutput(`
      @table
      model Session {
        @key id: uuid;
        token: jwt;
      }
    `);
    const scalarsFile = getOutputFileContent(output, "_scalars.py");
    const modelFile = getOutputFileContent(output, "session.py");

    expect(scalarsFile).toContain("jwt = Annotated[str, Field(");
    expect(scalarsFile).toContain("pattern=");
    expect(modelFile).toContain("from ._scalars import jwt");
    expect(modelFile).toContain("token: jwt");
  });

  it("imports top-level scalar aliases from nested namespace packages", async () => {
    const output = await renderPyOutput(`
      namespace Demo.Identity {

      @minLength(8)
      scalar StrongPassword extends string;

      model SignInRequest {
        password: StrongPassword;
      }
      }
    `);
    const scalarsFile = getOutputFileContent(output, "test/_scalars.py");
    const modelFile = getOutputFileContent(output, "test/demo/identity/sign_in_request.py");

    expect(scalarsFile).toContain("StrongPassword = Annotated[str, Field(");
    expect(modelFile).toContain("from ..._scalars import StrongPassword");
    expect(modelFile).toContain("password: StrongPassword");
  });

  it("imports root-namespace scalar aliases via single-dot relative import", async () => {
    const output = await renderPyOutput(`
      @minLength(8)
      scalar StrongPassword extends string;

      @table
      model RootUser {
        @key id: uuid;
        password: StrongPassword;
      }

      model SignInRequest {
        password: StrongPassword;
      }
    `);
    const scalarsFile = getOutputFileContent(output, "_scalars.py");
    const tableFile = getOutputFileContent(output, "root_user.py");
    const dataFile = getOutputFileContent(output, "sign_in_request.py");

    expect(scalarsFile).toContain("StrongPassword = Annotated[str, Field(");
    // Root-namespace models produce a single-dot relative import — anything
    // less is a syntax error in Python and will fail to import at runtime.
    expect(tableFile).toContain("from ._scalars import StrongPassword");
    expect(tableFile).not.toMatch(/^from _scalars/m);
    expect(dataFile).toContain("from ._scalars import StrongPassword");
    expect(dataFile).not.toMatch(/^from _scalars/m);
  });

  it("does not emit composite marker scalars as aliases", async () => {
    const output = await renderPyOutput(`
      @table
      model User {
        @key id: uuid;
        email: string;
        deletedAt?: utcDateTime;

        @unique
        emailDeletedAt: composite<"email", "deletedAt">;
      }
    `);
    const modelFile = getOutputFileContent(output, "user.py");

    expect(() => getOutputFileContent(output, "_scalars.py")).toThrow();
    expect(modelFile).not.toContain("_scalars");
    expect(modelFile).not.toContain("composite");
  });

  it("hoists scalars shared across two top-level namespaces to _shared/scalars.py", async () => {
    // Skip the standard test wrapper — it pins everything under a single
    // top-level `Test` namespace which would prevent two top-levels from
    // existing. Use the bare host to compile a real cross-top-level program.
    const host = await createTestHost([TypeSpecSqlModelTestLibrary]);
    host.addTypeSpecFile(
      "main.tsp",
      `
        import "@qninhdt/typespec-orm";
        using Qninhdt.Orm;

        @minLength(8)
        scalar StrongPassword extends string;

        namespace Foo.Identity {
          @table
          model FooUser {
            @key id: uuid;
            password: StrongPassword;
          }
        }

        namespace Bar.Identity {
          @table
          model BarUser {
            @key id: uuid;
            password: StrongPassword;
          }
        }
      `,
    );
    await host.compile("main.tsp");

    const outDir = await mkdtemp(join(tmpdir(), "sqlmodel-shared-scalars-"));
    await emit({
      program: host.program,
      options: { standalone: true, "library-name": "demo" },
      emitterOutputDir: outDir,
    } as never);

    const sharedFile = await readFile(join(outDir, "_shared/scalars.py"), "utf8");
    const fooScalars = await readFile(join(outDir, "foo/_scalars.py"), "utf8");
    const barScalars = await readFile(join(outDir, "bar/_scalars.py"), "utf8");

    expect(sharedFile).toContain("StrongPassword = Annotated[str, Field(");
    expect(fooScalars).toContain("from .._shared.scalars import StrongPassword");
    expect(fooScalars).not.toContain("StrongPassword = Annotated");
    expect(barScalars).toContain("from .._shared.scalars import StrongPassword");
    expect(barScalars).not.toContain("StrongPassword = Annotated");
  });

  it("emits unsupported-type when scalarAliasNames is missing an entry for a custom scalar", async () => {
    // Drive generateField directly with an empty alias map so we exercise the
    // exact "no alias registered" branch. In production this only fires when
    // the orchestrator forgets to plumb the map through — but rather than rely
    // on a buggy harness, we simulate the condition with an explicit empty
    // map on a property whose scalar has no native pydantic type.
    const runner = await createTestRunner();
    await runner.compile(`
      @minLength(8)
      scalar StrongPassword extends string;

      @table
      model RootUser {
        @key id: uuid;
        password: StrongPassword;
      }
    `);

    const passwordProp = (() => {
      const root = runner.program.getGlobalNamespaceType();
      const queue = [root];
      while (queue.length > 0) {
        const ns = queue.shift()!;
        const model = ns.models.get("RootUser");
        if (model) {
          const prop = model.properties.get("password");
          if (prop) return prop as ModelProperty;
        }
        for (const child of ns.namespaces.values()) queue.push(child);
      }
      throw new Error("password property not found");
    })();

    // Empty alias map → simulate the missing-entry path.
    const emptyAliasNames = new Map<Scalar, string>();
    generateField(
      runner.program,
      passwordProp,
      new Set(),
      new Set(),
      new Set(),
      { value: false },
      { value: false },
      false,
      undefined,
      undefined,
      emptyAliasNames,
    );

    const hits = runner.program.diagnostics.filter(
      (d) => d.code === "@qninhdt/typespec-sqlmodel/unsupported-type",
    );
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].severity).toBe("error");
  });
});
