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

  it("generates SAEnum column for enum field", async () => {
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

    // Field should use sa_column with SAEnum
    expect(output).toContain("SAEnum(Role)");
    expect(output).toContain("Enum as SAEnum");
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
