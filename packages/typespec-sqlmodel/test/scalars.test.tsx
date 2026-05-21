import { describe, expect, it } from "vitest";
import { emitPyFile, renderPyOutput } from "./utils.jsx";
import { getOutputFileContent } from "@qninhdt/typespec-orm/testing";

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

  it("maps string to str with default max_length=255", async () => {
    const output = await emitPyFile(
      `
      @table
      model User {
        @key id: uuid;
        name: string;
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

      @data("Login form")
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
});
