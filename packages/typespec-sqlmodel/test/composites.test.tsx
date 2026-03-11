import { describe, expect, it } from "vitest";
import { emitPyFile } from "./utils.jsx";

describe("SQLModel composite index", () => {
  it("generates __table_args__ with Index for @compositeIndex", async () => {
    const output = await emitPyFile(
      `
      @table
      @compositeIndex("idx_name_email", "name", "email")
      model User {
        @id id: uuid;
        name: string;
        email: string;
      }
    `,
      "user.py",
    );

    expect(output).toContain("__table_args__");
    expect(output).toContain('Index("idx_name_email", "name", "email")');
    expect(output).toContain("from sqlalchemy import");
    expect(output).toContain("Index");
  });
});

describe("SQLModel composite unique", () => {
  it("generates __table_args__ with UniqueConstraint for @compositeUnique", async () => {
    const output = await emitPyFile(
      `
      @table
      @compositeUnique("uq_email_name", "email", "name")
      model User {
        @id id: uuid;
        email: string;
        name: string;
      }
    `,
      "user.py",
    );

    expect(output).toContain("__table_args__");
    expect(output).toContain("UniqueConstraint");
    expect(output).toContain('name="uq_email_name"');
  });

  it("generates multiple composite constraints", async () => {
    const output = await emitPyFile(
      `
      @table
      @compositeIndex("idx_a_b", "name", "email")
      @compositeUnique("uq_c_d", "code", "name")
      model Product {
        @id id: uuid;
        name: string;
        email: string;
        code: string;
      }
    `,
      "product.py",
    );

    expect(output).toContain("Index");
    expect(output).toContain("UniqueConstraint");
  });
});
