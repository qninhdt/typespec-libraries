import { describe, expect, it } from "vitest";
import { emitGoFile } from "./utils.jsx";

describe("GORM composite index", () => {
  it("generates @compositeIndex as index:NAME,priority:N on each field", async () => {
    const output = await emitGoFile(
      `
      @table
      @compositeIndex("idx_name_email", "name", "email")
      model User {
        @id id: uuid;
        name: string;
        email: string;
      }
    `,
      "user.go",
    );

    // Each field in the composite should get index:NAME,priority:N
    expect(output).toContain("index:idx_name_email,priority:1");
    expect(output).toContain("index:idx_name_email,priority:2");

    // Priority 1 should be on the name field
    const nameLine = output.split("\n").find((l) => l.includes("Name "));
    expect(nameLine).toContain("index:idx_name_email,priority:1");

    // Priority 2 should be on the email field
    const emailLine = output.split("\n").find((l) => l.includes("Email "));
    expect(emailLine).toContain("index:idx_name_email,priority:2");
  });
});

describe("GORM composite unique", () => {
  it("generates @compositeUnique as uniqueIndex:NAME,priority:N on each field", async () => {
    const output = await emitGoFile(
      `
      @table
      @compositeUnique("uq_name_email", "name", "email")
      model User {
        @id id: uuid;
        name: string;
        email: string;
      }
    `,
      "user.go",
    );

    expect(output).toContain("uniqueIndex:uq_name_email,priority:1");
    expect(output).toContain("uniqueIndex:uq_name_email,priority:2");
  });

  it("generates multiple composite constraints on the same model", async () => {
    const output = await emitGoFile(
      `
      @table
      @compositeIndex("idx_a_b", "name", "email")
      @compositeUnique("uq_c_d", "code", "version")
      model Product {
        @id id: uuid;
        name: string;
        email: string;
        code: string;
        version: int32;
      }
    `,
      "product.go",
    );

    // Both composites present
    expect(output).toContain("index:idx_a_b,priority:1");
    expect(output).toContain("index:idx_a_b,priority:2");
    expect(output).toContain("uniqueIndex:uq_c_d,priority:1");
    expect(output).toContain("uniqueIndex:uq_c_d,priority:2");
  });
});
