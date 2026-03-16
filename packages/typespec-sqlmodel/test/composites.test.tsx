import { describe, expect, it } from "vitest";
import { emitPyFile } from "./utils.jsx";

describe("SQLModel composite index", () => {
  it("generates __table_args__ with Index for composite<>", async () => {
    const output = await emitPyFile(
      `
      @table
      model User {
        @key id: uuid;
        name: string;
        email: string;
        idxNameEmail: composite<"name", "email">;
      }
    `,
      "user.py",
    );

    expect(output).toContain("__table_args__");
    // New naming: [tableName]_[col1]_[col2]_..._[idx]
    expect(output).toContain('Index("users_name_email_idx", "name", "email")');
    expect(output).toContain("from sqlalchemy import");
    expect(output).toContain("Index");
  });
});

describe("SQLModel composite unique", () => {
  it("generates __table_args__ with UniqueConstraint for composite<> with @unique", async () => {
    const output = await emitPyFile(
      `
      @table
      model User {
        @key id: uuid;
        email: string;
        name: string;
        @unique
        uqEmailName: composite<"email", "name">;
      }
    `,
      "user.py",
    );

    expect(output).toContain("__table_args__");
    expect(output).toContain("UniqueConstraint");
    expect(output).toContain('name="users_email_name_unique"');
  });

  it("generates multiple composite constraints", async () => {
    const output = await emitPyFile(
      `
      @table
      model Product {
        @key id: uuid;
        name: string;
        email: string;
        code: string;
        idxAB: composite<"name", "email">;
        @unique
        uqCD: composite<"code", "name">;
      }
    `,
      "product.py",
    );

    expect(output).toContain("Index");
    expect(output).toContain("UniqueConstraint");
  });
});
