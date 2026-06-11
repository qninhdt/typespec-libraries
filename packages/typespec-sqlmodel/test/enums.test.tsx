import { describe, expect, it } from "vitest";
import { emitPyFile } from "./utils.jsx";

describe("SQLModel enum generation", () => {
  it("generates Python str Enum class with members", async () => {
    const output = await emitPyFile(
      `
      enum Status {
        active: "active",
        inactive: "inactive",
        pending: "pending",
      }

      @table
      model User {
        @key id: uuid;
        status: Status;
      }
    `,
      "user.py",
    );

    // Enum class definition
    expect(output).toContain("class Status(str, Enum):");
    expect(output).toContain('active = "active"');
    expect(output).toContain('inactive = "inactive"');
    expect(output).toContain('pending = "pending"');

    // Imports
    expect(output).toContain("from enum import Enum");
  });

  it("generates a Text column (not SAEnum) for enum field", async () => {
    const output = await emitPyFile(
      `
      enum Role {
        admin: "admin",
        user: "user",
      }

      @table
      model User {
        @key id: uuid;
        role: Role;
      }
    `,
      "user.py",
    );

    // Enum fields map to a TEXT column (CHECK constraint), not a native
    // Postgres ENUM / SQLAlchemy SAEnum, to avoid destructive CREATE TYPE
    // migrations. The Python enum class is still generated for typing.
    expect(output).toContain("class Role(str, Enum):");
    expect(output).toContain("sa_column=Column(Text");
    expect(output).not.toContain("SAEnum");
  });

  it("escapes enum string values", async () => {
    const output = await emitPyFile(
      `
      enum Weird {
        quoted: "a\\"b",
      }

      @table
      model User {
        @key id: uuid;
        weird: Weird;
      }
    `,
      "user.py",
    );

    expect(output).toContain('quoted = "a\\"b"');
  });

  it("generates optional enum with | None", async () => {
    const output = await emitPyFile(
      `
      enum Status {
        active: "active",
        inactive: "inactive",
      }

      @table
      model User {
        @key id: uuid;
        status?: Status;
      }
    `,
      "user.py",
    );

    expect(output).toContain("Status | None");
  });
});
