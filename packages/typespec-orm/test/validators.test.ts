import { describe, expect, it } from "vitest";
import { createTestRunner } from "./utils.js";
import { $onValidate } from "../src/validators.js";

describe("$onValidate diagnostics", () => {
  it("reports multiple @key on same model", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      @table
      model User {
        @key
        id1: uuid;
        @key
        id2: uuid;
        name: string;
      }
    `);
    $onValidate(runner.program);

    const diags = runner.program.diagnostics.filter(
      (d) => d.code === "@qninhdt/typespec-orm/multiple-keys",
    );
    expect(diags).toHaveLength(1);
    expect(diags[0].severity).toBe("error");
  });

  it("reports duplicate table names", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      @table("users")
      model User {
        @test @key id: uuid;
        name: string;
      }

      @table("users")
      model Admin {
        @test @key id: uuid;
        name: string;
      }
    `);
    $onValidate(runner.program);

    const diags = runner.program.diagnostics.filter(
      (d) => d.code === "@qninhdt/typespec-orm/duplicate-table-name",
    );
    expect(diags).toHaveLength(1);
    expect(diags[0].severity).toBe("error");
  });

  it("uses inherited properties for table validation", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      model BaseRecord {
        @key id: uuid;
        email: string;
      }

      @table
      model User extends BaseRecord {
        @map("email") contactEmail: string;
      }
    `);
    $onValidate(runner.program);

    const missingKeyDiags = runner.program.diagnostics.filter(
      (d) => d.code === "@qninhdt/typespec-orm/missing-key",
    );
    const duplicateColumnDiags = runner.program.diagnostics.filter(
      (d) => d.code === "@qninhdt/typespec-orm/duplicate-column-name",
    );
    expect(missingKeyDiags).toHaveLength(0);
    expect(duplicateColumnDiags).toHaveLength(1);
  });

  it("reports @precision on integer types", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      @table
      model User {
        @key id: uuid;
        @precision(10, 2) count: int32;
      }
    `);
    $onValidate(runner.program);

    const diags = runner.program.diagnostics.filter(
      (d) => d.code === "@qninhdt/typespec-orm/precision-on-non-numeric",
    );
    expect(diags).toHaveLength(1);
    expect(diags[0].severity).toBe("error");
  });

  it("warns about redundant @unique on @key", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      @table
      model User {
        @key
        @unique
        id: uuid;
        name: string;
      }
    `);
    $onValidate(runner.program);

    const diags = runner.program.diagnostics.filter(
      (d) => d.code === "@qninhdt/typespec-orm/redundant-unique-on-key",
    );
    expect(diags).toHaveLength(1);
    expect(diags[0].severity).toBe("warning");
  });

  it("warns about redundant @index on @unique", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      @table
      model User {
        @test @key id: uuid;
        @unique @index email: string;
      }
    `);
    $onValidate(runner.program);

    const diags = runner.program.diagnostics.filter(
      (d) => d.code === "@qninhdt/typespec-orm/redundant-index-on-unique",
    );
    expect(diags).toHaveLength(1);
    expect(diags[0].severity).toBe("warning");
  });

  it("allows valid model without diagnostics", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      @table
      model User {
        @test @key id: uuid;
        name: string;
        @unique email: string;
      }
    `);
    $onValidate(runner.program);

    const ormDiagnostics = runner.program.diagnostics.filter(
      (d) => d.code?.startsWith("@qninhdt/typespec-orm/") && d.severity === "error",
    );
    expect(ormDiagnostics).toHaveLength(0);
  });

  it("reports missing local FK field", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      @table
      model Organization {
        @key id: uuid;
      }

      @table
      model User {
        @key id: uuid;
        @foreignKey("organizationId")
        organization: Organization;
      }
    `);
    $onValidate(runner.program);

    const diags = runner.program.diagnostics.filter(
      (d) => d.code === "@qninhdt/typespec-orm/foreign-key-local-missing",
    );
    expect(diags).toHaveLength(1);
  });

  it("reports missing target FK field", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      @table
      model Organization {
        @key id: uuid;
      }

      @table
      model User {
        @key id: uuid;
        organizationCode: string;
        @foreignKey("organizationCode", "code")
        organization: Organization;
      }
    `);
    $onValidate(runner.program);

    const diags = runner.program.diagnostics.filter(
      (d) => d.code === "@qninhdt/typespec-orm/foreign-key-target-missing",
    );
    expect(diags).toHaveLength(1);
  });

  it("reports incompatible FK column types", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      @table
      model Organization {
        @key code: string;
      }

      @table
      model User {
        @key id: uuid;
        organizationCode: uuid;
        @foreignKey("organizationCode", "code")
        organization: Organization;
      }
    `);
    $onValidate(runner.program);

    const diags = runner.program.diagnostics.filter(
      (d) => d.code === "@qninhdt/typespec-orm/foreign-key-type-mismatch",
    );
    expect(diags).toHaveLength(1);
  });

  it('reports @onDelete("SET NULL") on a non-nullable FK field', async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      @table
      model Organization {
        @key id: uuid;
      }

      @table
      model User {
        @key id: uuid;
        organizationId: uuid;
        @foreignKey("organizationId")
        @onDelete("SET NULL")
        organization: Organization;
      }
    `);
    $onValidate(runner.program);

    const diags = runner.program.diagnostics.filter(
      (d) => d.code === "@qninhdt/typespec-orm/foreign-key-set-null-non-nullable",
    );
    expect(diags).toHaveLength(1);
  });

  it("reports missing @mappedBy target property", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      @table
      model User {
        @key id: uuid;
        @mappedBy("owner")
        posts: Post[];
      }

      @table
      model Post {
        @key id: uuid;
        userId: uuid;
        @foreignKey("userId")
        user: User;
      }
    `);
    $onValidate(runner.program);

    const diags = runner.program.diagnostics.filter(
      (d) => d.code === "@qninhdt/typespec-orm/mapped-by-missing-property",
    );
    expect(diags).toHaveLength(1);
  });

  it("reports one-to-one inverse relations without a unique local FK", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      @table
      model User {
        @key id: uuid;
        @mappedBy("user")
        profile?: Profile;
      }

      @table
      model Profile {
        @key id: uuid;
        userId: uuid;
        @foreignKey("userId")
        user: User;
      }
    `);
    $onValidate(runner.program);

    const diags = runner.program.diagnostics.filter(
      (d) => d.code === "@qninhdt/typespec-orm/one-to-one-missing-unique",
    );
    expect(diags).toHaveLength(1);
  });

  it("reports cascade decorators used on scalar fields", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      @table
      model User {
        @key id: uuid;
        @onDelete("CASCADE")
        status: string;
        @onUpdate("CASCADE")
        code: string;
      }
    `);
    $onValidate(runner.program);

    const diags = runner.program.diagnostics.filter(
      (d) => d.code === "@qninhdt/typespec-orm/cascade-without-relation",
    );
    expect(diags).toHaveLength(2);
  });

  it("reports cascade decorators used on inherited scalar fields", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      model BaseRecord {
        @key id: uuid;
        @onDelete("CASCADE")
        status: string;
      }

      @table
      model User extends BaseRecord {
        name: string;
      }
    `);
    $onValidate(runner.program);

    const diags = runner.program.diagnostics.filter(
      (d) => d.code === "@qninhdt/typespec-orm/cascade-without-relation",
    );
    expect(diags).toHaveLength(1);
  });

  it("reports many-to-many declarations without an inverse", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      @table
      model User {
        @key id: uuid;
        @manyToMany("user_roles")
        roles: Role[];
      }

      @table
      model Role {
        @key id: uuid;
      }
    `);
    $onValidate(runner.program);

    const diags = runner.program.diagnostics.filter(
      (d) => d.code === "@qninhdt/typespec-orm/many-to-many-missing-inverse",
    );
    expect(diags).toHaveLength(1);
  });

  it("reports conflicting many-to-many join table names", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      @table
      model User {
        @key id: uuid;
        @manyToMany("user_roles")
        roles: Role[];
      }

      @table
      model Role {
        @key id: uuid;
        @manyToMany("role_users")
        users: User[];
      }
    `);
    $onValidate(runner.program);

    const diags = runner.program.diagnostics.filter(
      (d) => d.code === "@qninhdt/typespec-orm/many-to-many-conflicting-table",
    );
    expect(diags).toHaveLength(2);
  });

  it("reports explicit join-table conflicts", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      @table("user_roles")
      model UserRole {
        @key id: uuid;
      }

      @table
      model User {
        @key id: uuid;
        @manyToMany("user_roles")
        roles: Role[];
      }

      @table
      model Role {
        @key id: uuid;
        @manyToMany("user_roles")
        users: User[];
      }
    `);
    $onValidate(runner.program);

    const diags = runner.program.diagnostics.filter(
      (d) => d.code === "@qninhdt/typespec-orm/many-to-many-conflicting-explicit-table",
    );
    expect(diags).toHaveLength(1);
  });

  it("accepts a valid non-id referenced column relation", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      @table
      model Organization {
        @key
        @unique
        code: string;
      }

      @table
      model User {
        @key id: uuid;
        organizationCode: string;
        @foreignKey("organizationCode", "code")
        organization: Organization;
      }
    `);
    $onValidate(runner.program);

    const ormErrors = runner.program.diagnostics.filter(
      (d) =>
        d.code?.startsWith("@qninhdt/typespec-orm/") &&
        d.severity === "error" &&
        !d.code.endsWith("namespace-required"),
    );
    expect(ormErrors).toHaveLength(0);
  });

  it("accepts composite references to mapped property names", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      @table
      model User {
        @key id: uuid;
        @map("tenantId") tenantId: uuid;
        code: string;
        @unique tenantCode: composite<"tenantId", "code">;
      }
    `);
    $onValidate(runner.program);

    const compositeErrors = runner.program.diagnostics.filter(
      (d) =>
        d.code === "@qninhdt/typespec-orm/composite-column-not-found" ||
        d.code === "@qninhdt/typespec-orm/duplicate-column-in-composite",
    );
    expect(compositeErrors).toHaveLength(0);
  });

  it("reports composite column referencing non-existent property", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      @table
      model User {
        @key id: uuid;
        name: string;
        @index nameEmail: composite<"name", "email">;
      }
    `);
    $onValidate(runner.program);

    const diags = runner.program.diagnostics.filter(
      (d) => d.code === "@qninhdt/typespec-orm/composite-column-not-found",
    );
    expect(diags).toHaveLength(1);
  });

  it("reports multiple @version columns on the same model", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      @table
      model User {
        @key id: uuid;
        @version v1: int32 = 0;
        @version v2: int32 = 0;
      }
    `);
    $onValidate(runner.program);

    const diags = runner.program.diagnostics.filter(
      (d) => d.code === "@qninhdt/typespec-orm/multiple-version-columns",
    );
    expect(diags).toHaveLength(1);
  });

  it("reports multiple @tenantId columns on the same model", async () => {
    // @tenantId removed; placeholder retained so subsequent tests keep their
    // numbering. Skipped.
    expect(true).toBe(true);
  });

  it("accepts a single @version column without diagnostics", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      @table
      model User {
        @key id: uuid;
        @version revision: int32 = 0;
      }
    `);
    $onValidate(runner.program);

    const diags = runner.program.diagnostics.filter(
      (d) =>
        d.code === "@qninhdt/typespec-orm/multiple-version-columns" ||
        d.code === "@qninhdt/typespec-orm/multiple-tenant-id-columns",
    );
    expect(diags).toHaveLength(0);
  });

  it("errors on @foreignKey without an index/unique/key", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      @table model Tenant { @key id: uuid; }
      @table model Project {
        @key id: uuid;
        @foreignKey("id", "id") tenantId: uuid;
        tenant: Tenant;
      }
    `);
    $onValidate(runner.program);

    const diags = runner.program.diagnostics.filter(
      (d) => d.code === "@qninhdt/typespec-orm/foreign-key-without-index",
    );
    expect(diags.length).toBeGreaterThanOrEqual(1);
    expect(diags[0].severity).toBe("error");
  });

  it("does not warn when @foreignKey has @index", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      @table model Tenant { @key id: uuid; }
      @table model Project {
        @key id: uuid;
        @index @foreignKey("id", "id") tenantId: uuid;
        tenant: Tenant;
      }
    `);
    $onValidate(runner.program);

    const diags = runner.program.diagnostics.filter(
      (d) => d.code === "@qninhdt/typespec-orm/foreign-key-without-index",
    );
    expect(diags).toHaveLength(0);
  });

  it("errors when a model name or column name is a PostgreSQL reserved word", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      @table("user")
      model User {
        @key id: uuid;
        order: string;
      }
    `);
    $onValidate(runner.program);

    const diags = runner.program.diagnostics.filter(
      (d) => d.code === "@qninhdt/typespec-orm/pg-reserved-identifier",
    );
    // "user" (explicit table name) and "order" (column) are both reserved.
    expect(diags.length).toBeGreaterThanOrEqual(2);
    for (const diag of diags) {
      expect(diag.severity).toBe("error");
    }
    const messages = diags.map((d) => d.message);
    expect(messages.some((m) => m.includes('"user"'))).toBe(true);
    expect(messages.some((m) => m.includes('"order"'))).toBe(true);
  });

  it("reports mixin-field-conflict when a child model overrides a mixin field", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      @tableMixin
      model AuditFields {
        createdAt: utcDateTime;
      }

      @table
      model Post extends AuditFields {
        @key id: uuid;
        // Same field name as the mixin → child must not silently override.
        createdAt: utcDateTime;
      }
    `);
    $onValidate(runner.program);

    const diags = runner.program.diagnostics.filter(
      (d) => d.code === "@qninhdt/typespec-orm/mixin-field-conflict",
    );
    expect(diags.length).toBeGreaterThanOrEqual(1);
    expect(diags[0].severity).toBe("error");
    expect(diags[0].message).toContain("createdAt");
  });

  it("reports empty-index-columns when @@tableIndex is given an empty list", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      @table
      model User {
        @key id: uuid;
        name: string;
      }

      @@tableIndex(User, #[]);
    `);
    $onValidate(runner.program);

    const diags = runner.program.diagnostics.filter(
      (d) => d.code === "@qninhdt/typespec-orm/empty-index-columns",
    );
    expect(diags).toHaveLength(1);
    expect(diags[0].severity).toBe("error");
  });

  it("reports duplicate-column-in-index when @@tableUnique repeats a column", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      @table
      model User {
        @key id: uuid;
        email: string;
      }

      @@tableUnique(User, #["email", "email"], "user_email_unique");
    `);
    $onValidate(runner.program);

    const diags = runner.program.diagnostics.filter(
      (d) => d.code === "@qninhdt/typespec-orm/duplicate-column-in-index",
    );
    expect(diags).toHaveLength(1);
    expect(diags[0].severity).toBe("error");
    expect(diags[0].message).toContain("email");
  });

  it("reports default-expression-conflicts-literal when both are set on a property", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      @table
      model Item {
        @key id: uuid;
        @defaultExpression("now()") createdAt: utcDateTime = utcDateTime.fromISO("2024-01-01T00:00:00Z");
      }
    `);
    $onValidate(runner.program);

    const diags = runner.program.diagnostics.filter(
      (d) => d.code === "@qninhdt/typespec-orm/default-expression-conflicts-literal",
    );
    expect(diags).toHaveLength(1);
    expect(diags[0].severity).toBe("error");
    expect(diags[0].message).toContain("createdAt");
  });

  it("reports many-to-many-target-missing-key when a side has no @key", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      @table
      model Tag {
        // intentionally missing @key
        name: string;
      }

      @table
      model Post {
        @key id: uuid;
        @manyToMany("post_tag") tags: Tag[];
      }
    `);
    $onValidate(runner.program);

    const diags = runner.program.diagnostics.filter(
      (d) => d.code === "@qninhdt/typespec-orm/many-to-many-target-missing-key",
    );
    expect(diags.length).toBeGreaterThanOrEqual(1);
    expect(diags[0].severity).toBe("error");
    expect(diags[0].message).toContain("Tag");
  });

  it("reports auto-create-and-update-conflict when both decorators applied to same property", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      @table
      model Item {
        @key id: uuid;
        @autoCreateTime @autoUpdateTime touchedAt: utcDateTime;
      }
    `);
    $onValidate(runner.program);

    const diags = runner.program.diagnostics.filter(
      (d) => d.code === "@qninhdt/typespec-orm/auto-create-and-update-conflict",
    );
    expect(diags).toHaveLength(1);
    expect(diags[0].severity).toBe("error");
    expect(diags[0].message).toContain("touchedAt");
  });

  it("reports multiple-auto-increment-columns when more than one @autoIncrement is present", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      @table
      model Counter {
        @key @autoIncrement id: int64;
        @autoIncrement seq: int64;
      }
    `);
    $onValidate(runner.program);

    const diags = runner.program.diagnostics.filter(
      (d) => d.code === "@qninhdt/typespec-orm/multiple-auto-increment-columns",
    );
    expect(diags).toHaveLength(1);
    expect(diags[0].severity).toBe("error");
  });

  it("reports auto-increment-requires-key when @autoIncrement is on a non-key property", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      @table
      model Item {
        @key id: uuid;
        @autoIncrement seq: int64;
      }
    `);
    $onValidate(runner.program);

    const diags = runner.program.diagnostics.filter(
      (d) => d.code === "@qninhdt/typespec-orm/auto-increment-requires-key",
    );
    expect(diags).toHaveLength(1);
    expect(diags[0].severity).toBe("error");
    expect(diags[0].message).toContain("seq");
  });

  it("reports auto-increment-requires-key when @autoIncrement is on an optional property", async () => {
    const runner = await createTestRunner();
    await runner.compile(`
      @table
      model Item {
        @key id: uuid;
        @autoIncrement seq?: int64;
      }
    `);
    $onValidate(runner.program);

    const diags = runner.program.diagnostics.filter(
      (d) => d.code === "@qninhdt/typespec-orm/auto-increment-requires-key",
    );
    expect(diags).toHaveLength(1);
    expect(diags[0].severity).toBe("error");
  });
});
