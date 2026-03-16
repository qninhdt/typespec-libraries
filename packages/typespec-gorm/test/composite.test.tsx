import { describe, expect, it } from "vitest";
import { emitGoFile } from "./utils.jsx";

describe("GORM composite type", () => {
  it("generates composite index from composite<> type", async () => {
    const output = await emitGoFile(
      `
      @table
      model User {
        @key id: uuid;
        organizationId: uuid;
        createdAt: utcDateTime;
        myIndex: composite<"organizationId", "createdAt">;
      }
    `,
      "user.go",
    );

    // New naming: [tableName]_[col1]_[col2]_..._[idx] with snake_case columns
    expect(output).toContain("index:users_organization_id_created_at_idx,priority:2");
  });

  it("generates composite unique from composite<> type with @unique", async () => {
    const output = await emitGoFile(
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
      "user.go",
    );

    expect(output).toContain("uniqueIndex:users_organization_id_email_unique,priority:2");
  });

  it("generates composite primary key from composite<> type with @key", async () => {
    const output = await emitGoFile(
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
      "user.go",
    );

    expect(output).toContain("primaryIndex:users_tenant_id_code_pk,priority:2");
  });
});
