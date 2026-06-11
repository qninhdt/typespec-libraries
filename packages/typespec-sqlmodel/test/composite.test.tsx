import { describe, expect, it } from "vitest";
import { emitPyFile } from "./utils.jsx";

describe("SQLModel composite type", () => {
  it("generates composite index from composite<> type", async () => {
    const output = await emitPyFile(
      `
      @table
      model User {
        @key id: uuid;
        organizationId: uuid;
        createdAt: utcDateTime;
        myIndex: composite<"organizationId", "createdAt">;
      }
    `,
      "user.py",
    );

    // New naming: [tableName]_[col1]_[col2]_..._[idx]
    expect(output).toContain(
      'Index("users_organization_id_created_at_idx", "organization_id", "created_at")',
    );
  });

  it("generates composite unique constraint from composite<> type with @unique", async () => {
    const output = await emitPyFile(
      `
      @table
      model User {
        @key id: uuid;
        organizationId: uuid;
        email: string;
        @unique
        myUnique: composite<"organizationId", "email">;
      }
    `,
      "user.py",
    );

    expect(output).toContain(
      'UniqueConstraint("organization_id", "email", name="users_organization_id_email_unique")',
    );
  });

  it("generates composite primary key from composite<> type with @key", async () => {
    const output = await emitPyFile(
      `
      @table
      model User {
        @key id: uuid;
        @key
        myCompositePk: composite<"tenantId", "code">;
        tenantId: uuid;
        code: string;
      }
    `,
      "user.py",
    );

    // A composite @key emits field-level primary_key=True on each member
    // (a real composite PRIMARY KEY); a separate UniqueConstraint would be
    // redundant with the primary key and is intentionally not emitted.
    expect(output).toContain("tenant_id: UUID = Field(default_factory=uuid4, primary_key=True)");
    expect(output).toContain("code: str = Field(primary_key=True)");
    expect(output).not.toContain("UniqueConstraint");
  });

  it("generates composite index with 3 columns", async () => {
    const output = await emitPyFile(
      `
      @table
      model User {
        @key id: uuid;
        fieldA: string;
        fieldB: string;
        fieldC: string;
        myIndex: composite<"fieldA", "fieldB", "fieldC">;
      }
    `,
      "user.py",
    );

    expect(output).toContain(
      'Index("users_field_a_field_b_field_c_idx", "field_a", "field_b", "field_c")',
    );
  });
});
