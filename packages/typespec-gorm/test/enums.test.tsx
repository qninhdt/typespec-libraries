import { describe, expect, it } from "vitest";
import { emitGoFile } from "./utils.jsx";

describe("GORM enum generation", () => {
  it("generates Go string type and const block", async () => {
    const output = await emitGoFile(
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
      "user.go",
    );

    // Enum type
    expect(output).toContain("type Status string");

    // Const block with prefixed names
    expect(output).toContain("const (");
    expect(output).toContain('\tStatusActive Status = "active"');
    expect(output).toContain('\tStatusInactive Status = "inactive"');
    expect(output).toContain('\tStatusPending Status = "pending"');
    expect(output).toContain(")");
  });

  it("generates field with enum type and varchar GORM type", async () => {
    const output = await emitGoFile(
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
      "user.go",
    );

    // Field should use enum type, not string
    expect(output).toContain("\tRole Role");
    // GORM type should be varchar with length matching longest value
    expect(output).toMatch(/type:varchar\(\d+\)/);
  });

  it("generates oneof validator for enum fields", async () => {
    const output = await emitGoFile(
      `
      enum Plan {
        free: "free",
        premium: "premium",
      }

      @table
      model Subscription {
        @key id: uuid;
        plan: Plan;
      }
    `,
      "subscription.go",
    );

    // Validate tag should include oneof with all enum values
    expect(output).toContain("oneof=free,premium");
  });

  it("generates optional enum with pointer type", async () => {
    const output = await emitGoFile(
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
      "user.go",
    );

    // Optional enum → pointer type
    expect(output).toContain("*Status");
  });
});
