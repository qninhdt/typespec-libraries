import { describe, expect, it } from "vitest";
import { emitPyFile } from "./utils.jsx";

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
