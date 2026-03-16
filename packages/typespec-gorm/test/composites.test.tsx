import { describe, expect, it } from "vitest";
import { emitGoFile } from "./utils.jsx";

describe("GORM composite index", () => {
  it("generates composite<> as index:NAME,priority:N on each field", async () => {
    const output = await emitGoFile(
      `
      @table
      model User {
        @key id: uuid;
        name: string;
        email: string;
        idxNameEmail: composite<"name", "email">;
      }
    `,
      "user.go",
    );

    // Each field in the composite should get index:NAME,priority:N
    // New naming: [tableName]_[col1]_[col2]_..._[idx]
    expect(output).toContain("index:users_name_email_idx,priority:1");
    expect(output).toContain("index:users_name_email_idx,priority:2");

    // Priority 1 should be on the name field
    const nameLine = output.split("\n").find((l) => l.includes("Name "));
    expect(nameLine).toContain("index:users_name_email_idx,priority:1");

    // Priority 2 should be on the email field
    const emailLine = output.split("\n").find((l) => l.includes("Email "));
    expect(emailLine).toContain("index:users_name_email_idx,priority:2");
  });
});

describe("GORM composite unique", () => {
  it("generates composite<> with @unique as uniqueIndex:NAME,priority:N on each field", async () => {
    const output = await emitGoFile(
      `
      @table
      model User {
        @key id: uuid;
        name: string;
        email: string;
        @unique
        uqNameEmail: composite<"name", "email">;
      }
    `,
      "user.go",
    );

    expect(output).toContain("uniqueIndex:users_name_email_unique,priority:1");
    expect(output).toContain("uniqueIndex:users_name_email_unique,priority:2");
  });

  it("generates multiple composite constraints on the same model", async () => {
    const output = await emitGoFile(
      `
      @table
      model Product {
        @key id: uuid;
        name: string;
        email: string;
        code: string;
        version: int32;
        idxAB: composite<"name", "email">;
        @unique
        uqCD: composite<"code", "version">;
      }
    `,
      "product.go",
    );

    // Both composites present
    expect(output).toContain("index:products_name_email_idx,priority:1");
    expect(output).toContain("index:products_name_email_idx,priority:2");
    expect(output).toContain("uniqueIndex:products_code_version_unique,priority:1");
    expect(output).toContain("uniqueIndex:products_code_version_unique,priority:2");
  });

  it("composite unique with soft delete - fields get composite tags, NOT standalone uniqueIndex", async () => {
    const output = await emitGoFile(
      `
      model Timestamped {
        @key id: uuid;
        @softDelete deletedAt?: utcDateTime;
      }

      @table
      model User {
        ...Timestamped;
        email: string;
        @unique
        emailDeletedAt: composite<"email", "deletedAt">;
      }
    `,
      "user.go",
    );

    // Email should have composite uniqueIndex with priority:1
    const emailLine = output.split("\n").find((l) => l.includes("Email "));
    expect(emailLine).toContain("uniqueIndex:users_email_deleted_at_unique,priority:1");
    // Email should NOT have standalone uniqueIndex
    expect(emailLine).not.toMatch(/uniqueIndex:users_email_unique/);

    // DeletedAt should have composite uniqueIndex with priority:2
    const deletedAtLine = output.split("\n").find((l) => l.includes("DeletedAt"));
    expect(deletedAtLine).toContain("uniqueIndex:users_email_deleted_at_unique,priority:2");
  });
});
